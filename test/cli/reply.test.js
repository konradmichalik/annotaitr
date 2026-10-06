import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseReplyArgs, runReply } from '../../cli/reply.js'
import { writeSession, readSession } from '../../server/core/session/store.js'
import { buildThreads, nextSession } from '../../server/core/session/threads.js'

const ID = '2f8c1a9e04b7'
const UUID = 'a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d'
const ARGS = ['--session', ID, '--to', 'a3f19c2e', '--status', 'applied', '--text', 'Moved the button']

describe('parseReplyArgs', () => {
  it('reads all four options in any order', () => {
    expect(parseReplyArgs(['--text', 'x', '--status', 'applied', '--to', 'a3f19c2e', '--session', ID]))
      .toEqual({ sessionId: ID, to: 'a3f19c2e', status: 'applied', text: 'x' })
  })

  it('lets the text start with a dash', () => {
    expect(parseReplyArgs([...ARGS.slice(0, 6), '--text', '- removed the border']).text).toBe('- removed the border')
  })

  it('names missing options', () => {
    expect(parseReplyArgs(['--session', ID]).error).toBe('Missing --to, --status, --text')
  })

  it('rejects unknown arguments and a dangling option', () => {
    expect(parseReplyArgs(['--help']).error).toBe('Unknown reply argument: --help')
    expect(parseReplyArgs(['--session']).error).toBe('--session requires a value')
  })

  it('rejects a session id that could name another path', () => {
    expect(parseReplyArgs(['--session', '../x', ...ARGS.slice(2)]).error).toMatch(/Invalid session id "\.\.\/x"/)
  })
})

describe('runReply', () => {
  let dir

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-reply-'))
    const threads = buildThreads([{ id: UUID, type: 'pin', geometry: { x: 1, y: 1 }, text: 'Fix' }])
    await writeSession(nextSession(null, { sessionId: ID, target: { kind: 'file', label: 'a.png' }, threads, now: 1 }), dir)
  })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('records the reply and confirms it', async () => {
    expect(await runReply(ARGS, { now: 7, dir })).toEqual({
      output: `Recorded applied reply to #a3f19c2e in session ${ID} (round 1).\n`
    })
    const { session } = await readSession(ID, dir)
    expect(session.threads[0].replies).toMatchObject([{ author: 'agent', status: 'applied', text: 'Moved the button', createdAt: 7 }])
  })

  it('fails on a session that does not exist', async () => {
    const result = await runReply(['--session', 'aaaaaaaaaaaa', ...ARGS.slice(2)], { dir })
    expect(result.error).toBe(`No review session aaaaaaaaaaaa in ${dir}`)
  })

  it('fails on a damaged session file instead of overwriting it', async () => {
    await writeFile(join(dir, `${ID}.json`), 'not json')
    expect((await runReply(ARGS, { dir })).error).toMatch(/not valid JSON/)
  })

  it('passes validation errors through and appends the usage to argument errors', async () => {
    const result = await runReply([...ARGS.slice(0, 4), '--status', 'done', '--text', 'x'], { dir })
    expect(result.error).toMatch(/Unknown status "done"/)
    const usage = await runReply(['--session', ID], { dir })
    expect(usage.error).toMatch(/Usage: annotaitr reply --session <id>/)
  })

  it('runs as a subcommand of the CLI and exits non-zero on errors', () => {
    const env = { ...process.env, ANNOTAITR_SESSION_DIR: dir }
    const ok = spawnSync('node', ['index.js', 'reply', ...ARGS], { env, encoding: 'utf-8' })
    expect(ok.status).toBe(0)
    expect(ok.stdout).toMatch(/^Recorded applied reply/)
    const bad = spawnSync('node', ['index.js', 'reply', '--session', ID], { env, encoding: 'utf-8' })
    expect(bad.status).toBe(1)
    expect(bad.stderr).toMatch(/^Error: Missing --to/)
  })
})
