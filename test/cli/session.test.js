import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSession, recordSession } from '../../cli/session.js'
import { readSession, writeSession, RESUME_WINDOW_MS } from '../../server/core/session/store.js'
import { sessionIdFor } from '../../server/core/session/identity.js'

const UUID = 'a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d'
const target = { kind: 'file', label: 'shot.png' }
const pin = { id: UUID, type: 'pin', geometry: { x: 5, y: 5 }, text: 'Fix' }

describe('review sessions in the CLI', () => {
  let dir
  let logged
  const log = (line) => logged.push(line)
  const open = (extra = {}) => openSession({ identity: '/abs/shot.png', target, now: 1000, dir, log, ...extra })

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-cli-session-'))
    logged = []
  })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('starts round 1 for a target seen for the first time', async () => {
    expect(await open()).toEqual({ sessionId: sessionIdFor('/abs/shot.png'), target, previous: null })
  })

  it('records the decision and returns the line for the agent', async () => {
    const opened = await open()
    const line = await recordSession(opened, { annotations: [pin] }, { now: 2000, dir, log })
    expect(line).toMatch(new RegExp(`^\\nSession: ${opened.sessionId} \\(round 1\\)`))
    const { session } = await readSession(opened.sessionId, dir)
    expect(session).toMatchObject({ round: 1, writtenAt: 2000, target, threads: [{ handle: 'a3f19c2e', number: 1, annotation: pin }] })
  })

  it('stores the fingerprint the runner attached to the session', async () => {
    const opened = { ...(await open()), fingerprint: 'sha256:ab' }
    await recordSession(opened, { annotations: [pin] }, { now: 2000, dir, log })
    expect((await readSession(opened.sessionId, dir)).session.fingerprint).toBe('sha256:ab')
  })

  it('continues a recent session and says so', async () => {
    await recordSession(await open(), { annotations: [pin] }, { now: 2000, dir, log })
    const opened = await open({ now: 3000 })
    expect(opened.previous.round).toBe(1)
    expect(logged.at(-1)).toMatch(/Continuing review session .* at round 2\. Start over with --new-session/)
    expect(await recordSession(opened, { annotations: [] }, { now: 4000, dir, log })).toBe('')
    expect((await readSession(opened.sessionId, dir)).session.round).toBe(2)
  })

  it('ignores a session older than 24 hours and names its file', async () => {
    await recordSession(await open(), { annotations: [pin] }, { now: 2000, dir, log })
    const opened = await open({ now: 2000 + RESUME_WINDOW_MS + 1 })
    expect(opened.previous).toBeNull()
    expect(logged.at(-1)).toMatch(/Ignoring review session .*\.json from more than 24 hours ago/)
  })

  it('starts fresh with --new-session', async () => {
    await recordSession(await open(), { annotations: [pin] }, { now: 2000, dir, log })
    expect((await open({ newSession: true, now: 3000 })).previous).toBeNull()
  })

  it('starts fresh with a warning when the stored session is damaged', async () => {
    const opened = await open()
    await writeFile(join(dir, `${opened.sessionId}.json`), 'not json')
    expect((await open()).previous).toBeNull()
    expect(logged.at(-1)).toMatch(/not valid JSON\. Starting a new review session/)
  })

  it('gives a clipboard image a random session id', async () => {
    const opened = await open({ identity: null, target: { kind: 'clipboard', label: 'clipboard image' } })
    expect(opened.sessionId).toMatch(/^[0-9a-f]{12}$/)
    expect(opened.previous).toBeNull()
  })

  it('resumes a named session regardless of age, and fails on an unknown one', async () => {
    await writeSession({ schemaVersion: 1, sessionId: 'aaaaaaaaaaaa', round: 4, writtenAt: 0, target, threads: [] }, dir)
    expect((await open({ identity: null, sessionId: 'aaaaaaaaaaaa', now: 10 * RESUME_WINDOW_MS })).previous.round).toBe(4)
    expect(await open({ sessionId: 'bbbbbbbbbbbb' })).toEqual({ error: `No review session bbbbbbbbbbbb in ${dir}` })
  })

  it('records the element a mark points at on a captured page', async () => {
    const opened = await open({ target: { kind: 'url', label: 'http://x/' } })
    const domMap = [{ tag: 'button', name: 'Buy', selector: '#buy', box: { x: 0, y: 0, width: 20, height: 20 } }]
    await recordSession(opened, { annotations: [pin], domMap }, { now: 2000, dir, log })
    expect((await readSession(opened.sessionId, dir)).session.threads[0].element).toBe('button "Buy" · #buy')
  })

  it('warns instead of failing when the session cannot be written', async () => {
    const blocked = join(dir, 'file')
    await writeFile(blocked, '')
    const opened = await openSession({ identity: '/abs/shot.png', target, now: 1000, dir: blocked, log })
    expect(await recordSession(opened, { annotations: [pin] }, { now: 2000, dir: blocked, log })).toBe('')
    expect(logged.at(-1)).toMatch(/^Warning: could not save review session/)
  })
})
