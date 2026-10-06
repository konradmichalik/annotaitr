import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, stat, utimes, readdir, mkdir, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SCHEMA_VERSION, readSession, writeSession, pruneSessions, sessionDir
} from '../../../../server/core/session/store.js'

const ID = '2f8c1a9e04b7'
const session = (extra = {}) => ({
  schemaVersion: SCHEMA_VERSION, sessionId: ID, round: 1, writtenAt: 1, target: { kind: 'file', label: 'a.png' }, threads: [], ...extra
})

describe('session store', () => {
  let dir

  beforeEach(async () => { dir = join(await mkdtemp(join(tmpdir(), 'annotaitr-store-')), 'sessions') })
  afterEach(async () => { await rm(join(dir, '..'), { recursive: true, force: true }) })

  it('defaults to a folder in the temp dir and honours ANNOTAITR_SESSION_DIR', () => {
    const previous = process.env.ANNOTAITR_SESSION_DIR
    delete process.env.ANNOTAITR_SESSION_DIR
    expect(sessionDir()).toBe(join(tmpdir(), 'annotaitr-sessions'))
    process.env.ANNOTAITR_SESSION_DIR = '/custom'
    expect(sessionDir()).toBe('/custom')
    if (previous === undefined) { delete process.env.ANNOTAITR_SESSION_DIR } else { process.env.ANNOTAITR_SESSION_DIR = previous }
  })

  it('writes and reads a session back', async () => {
    await writeSession(session({ round: 3 }), dir)
    expect(await readSession(ID, dir)).toEqual({ session: session({ round: 3 }) })
  })

  it('creates the folder and file readable by the owner only, because sessions hold review comments', async () => {
    const path = await writeSession(session(), dir)
    expect((await stat(dir)).mode & 0o777).toBe(0o700)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it('leaves no temp file behind', async () => {
    await writeSession(session(), dir)
    expect(await readdir(dir)).toEqual([`${ID}.json`])
  })

  it('reports a missing session', async () => {
    expect(await readSession(ID, dir)).toEqual({ missing: true })
  })

  it('reports a file that is not JSON instead of throwing', async () => {
    await writeSession(session(), dir)
    await writeFile(join(dir, `${ID}.json`), '{"schemaVersion": 1, "ro')
    expect((await readSession(ID, dir)).error).toMatch(/not valid JSON/)
  })

  it('reports another schema version', async () => {
    await writeSession(session({ schemaVersion: 99 }), dir)
    expect((await readSession(ID, dir)).error).toMatch(/schema version 99/)
  })

  it('refuses an id that is not a session id before touching the disk', async () => {
    await expect(writeSession(session({ sessionId: '../escape' }), dir)).rejects.toThrow(/Invalid session id/)
    expect((await readSession('../escape', dir)).error).toMatch(/Invalid session id/)
  })

  it('deletes only sessions older than seven days', async () => {
    const now = Date.now()
    await writeSession(session(), dir)
    await writeSession(session({ sessionId: 'aaaaaaaaaaaa' }), dir)
    const old = new Date(now - 8 * 24 * 60 * 60 * 1000)
    await utimes(join(dir, 'aaaaaaaaaaaa.json'), old, old)
    expect(await pruneSessions(now, dir)).toBe(1)
    expect(await readdir(dir)).toEqual([`${ID}.json`])
  })

  it('reports a session with the right schema but the wrong shape', async () => {
    for (const broken of [{ threads: undefined }, { round: 'x' }, { writtenAt: undefined }]) {
      await writeSession(session(broken), dir)
      expect((await readSession(ID, dir)).error).toMatch(/malformed/)
    }
  })

  it('refuses to write into a folder other users can open, which could swap or read sessions', async () => {
    await mkdir(dir, { mode: 0o755 })
    await chmod(dir, 0o755)
    await expect(writeSession(session(), dir)).rejects.toThrow(/closed to others/)
  })

  it('treats pruning as best effort when an old session cannot be removed', async () => {
    await writeSession(session(), dir)
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await utimes(join(dir, `${ID}.json`), old, old)
    await chmod(dir, 0o555)
    try {
      expect(await pruneSessions(Date.now(), dir)).toBe(0)
    } finally {
      await chmod(dir, 0o700)
    }
  })

  it('prunes nothing when the folder does not exist yet', async () => {
    expect(await pruneSessions(Date.now(), dir)).toBe(0)
  })
})
