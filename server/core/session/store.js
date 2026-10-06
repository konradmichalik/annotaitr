/**
 * Review sessions on disk: one JSON file per session, carrying the marks of
 * the last submitted round and the agent's replies to them.
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, readFile, writeFile, rename, readdir, stat, rm } from 'node:fs/promises'
import { isSessionId } from './identity.js'

export const SCHEMA_VERSION = 1
export const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

// Read on every call rather than at import, so a test or a wrapper can set it late.
export function sessionDir() {
  return process.env.ANNOTAITR_SESSION_DIR || join(tmpdir(), 'annotaitr-sessions')
}

function sessionPath(dir, sessionId) {
  if (!isSessionId(sessionId)) { throw new Error(`Invalid session id "${sessionId}"`) }
  return join(dir, `${sessionId}.json`)
}

export async function readSession(sessionId, dir = sessionDir()) {
  if (!isSessionId(sessionId)) { return { error: `Invalid session id "${sessionId}"` } }
  let raw
  try {
    raw = await readFile(sessionPath(dir, sessionId), 'utf-8')
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
  return { session }
}

export async function writeSession(session, dir = sessionDir()) {
  const target = sessionPath(dir, session.sessionId)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  // A reader must never see half a file, so the content lands under a temp name first.
  const temp = `${target}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(session, null, 2), { mode: 0o600 })
  await rename(temp, target)
  return target
}

// os.tmpdir() is not reliably cleaned on macOS, so old sessions are removed here.
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
      await rm(path, { force: true })
      removed++
    }
  }
  return removed
}
