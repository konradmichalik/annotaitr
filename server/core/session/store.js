/**
 * Review sessions on disk: one JSON file per session, carrying the marks of
 * the last submitted round and the agent's replies to them.
 */

import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { mkdir, readFile, writeFile, rename, readdir, stat, lstat, rm, open } from 'node:fs/promises'
import { isSessionId } from './identity.js'

export const SCHEMA_VERSION = 1
export const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const LOCK_WAIT_MS = 3000
const LOCK_STALE_MS = 10_000

// Read on every call rather than at import, so a test or a wrapper can set it late.
export function sessionDir() {
  return process.env.ANNOTAITR_SESSION_DIR || join(tmpdir(), 'annotaitr-sessions')
}

function sessionPath(dir, sessionId) {
  if (!isSessionId(sessionId)) { throw new Error(`Invalid session id "${sessionId}"`) }
  return join(dir, `${sessionId}.json`)
}

// On Linux tmpdir() is the shared /tmp: a folder another user created first
// could let them plant or swap session files, or a symlink under our temp name.
async function assertPrivateDir(dir) {
  const info = await lstat(dir)
  const foreign = typeof process.getuid === 'function' && info.uid !== process.getuid()
  if (!info.isDirectory() || foreign || (info.mode & 0o077) !== 0) {
    throw new Error(`${dir} must be a folder owned by you and closed to others (chmod 700)`)
  }
}

function isWellFormed(session) {
  return Array.isArray(session.threads) &&
    session.threads.every((t) => Array.isArray(t?.replies)) &&
    Number.isInteger(session.round) &&
    Number.isFinite(session.writtenAt)
}

export async function readSession(sessionId, dir = sessionDir()) {
  let path
  try {
    path = sessionPath(dir, sessionId)
    await assertPrivateDir(dir)
  } catch (error) {
    return error.code === 'ENOENT' ? { missing: true } : { error: error.message }
  }
  let raw
  try {
    raw = await readFile(path, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') { return { missing: true } }
    return { error: `Cannot read session ${sessionId}: ${error.message}` }
  }
  let session
  try {
    session = JSON.parse(raw)
  } catch {
    return { error: `Session ${sessionId} is not valid JSON` }
  }
  if (session?.schemaVersion !== SCHEMA_VERSION) {
    return { error: `Session ${sessionId} has schema version ${session?.schemaVersion}, this build reads ${SCHEMA_VERSION}` }
  }
  if (!isWellFormed(session)) { return { error: `Session ${sessionId} is malformed` } }
  return { session }
}

async function acquireLock(lock) {
  const deadline = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try {
      await (await open(lock, 'wx', 0o600)).close()
      return
    } catch (error) {
      if (error.code !== 'EEXIST') { throw error }
    }
    const info = await stat(lock).catch(() => null)
    if (info && Date.now() - info.mtimeMs > LOCK_STALE_MS) {
      await rm(lock, { force: true })
    } else if (Date.now() > deadline) {
      throw new Error(`Session is busy (${lock}), try again`)
    } else {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
}

async function withLock(target, work) {
  const lock = `${target}.lock`
  await acquireLock(lock)
  try {
    return await work()
  } finally {
    await rm(lock, { force: true })
  }
}

// A reader must never see half a file, so the content lands under a temp name first.
async function writeAtomic(target, session) {
  const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(temp, JSON.stringify(session, null, 2), { mode: 0o600, flag: 'wx' })
  await rename(temp, target)
  return target
}

// Locked as well, so a new round never lands in the middle of a reply that would write the old one back.
export async function writeSession(session, dir = sessionDir()) {
  const target = sessionPath(dir, session.sessionId)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await assertPrivateDir(dir)
  return withLock(target, () => writeAtomic(target, session))
}

/**
 * Read, change and write a session under a lock file. Agents often run
 * several `reply` calls in parallel, and without the lock the last write
 * would silently drop the others. `update(session)` returns `{ session }`
 * to save it or `{ error }` to leave the file alone.
 */
export async function updateSession(sessionId, dir, update) {
  const read = await readSession(sessionId, dir)
  if (!read.session) { return read }
  const target = sessionPath(dir, sessionId)
  return withLock(target, async () => {
    const fresh = await readSession(sessionId, dir)
    if (!fresh.session) { return fresh }
    const result = update(fresh.session)
    if (result.error) { return result }
    await writeAtomic(target, result.session)
    return result
  })
}

// os.tmpdir() is not reliably cleaned on macOS, so old sessions are removed
// here. Best effort: a file we may not delete must never stop a review.
export async function pruneSessions(now, dir = sessionDir()) {
  let names
  try {
    names = await readdir(dir)
  } catch {
    return 0
  }
  let removed = 0
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (info && now - info.mtimeMs > RETENTION_MS) {
      const gone = await rm(path, { force: true }).then(() => true, () => false)
      if (gone) { removed++ }
    }
  }
  return removed
}
