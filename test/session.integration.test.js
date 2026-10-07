import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { startCli } from './helpers/cli.js'
import { makeFixturePng } from './helpers/fixtureImage.js'

const UUID = 'a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d'
const pin = { id: UUID, type: 'pin', geometry: { x: 5, y: 5 }, text: 'Fix the spacing' }

async function reviewRound(image, env) {
  const cli = startCli([image], env)
  const url = await cli.url
  const post = (path, body) => fetch(`${url}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  await post('/api/annotations', { annotations: [pin] })
  await post('/api/feedback', {})
  return { code: await cli.exited, stdout: cli.stdout() }
}

async function threadsOfNextRound(image, env) {
  const cli = startCli([image], env)
  const url = await cli.url
  const body = await (await fetch(`${url}/api/threads`)).json()
  cli.child.kill()
  await cli.exited
  return body.data
}

describe('a review session across rounds', () => {
  let dir
  let image
  let env

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-session-it-'))
    image = join(dir, 'shot.png')
    await writeFile(image, makeFixturePng(40, 30))
    env = { ANNOTAITR_SESSION_DIR: join(dir, 'sessions') }
  })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('prints the session, accepts a reply and counts the next round', async () => {
    const first = await reviewRound(image, env)
    expect(first.code).toBe(0)
    const sessionId = first.stdout.match(/Session: ([0-9a-f]{12}) \(round 1\)/)[1]
    expect((await stat(join(dir, 'sessions', `${sessionId}.json`))).mode & 0o777).toBe(0o600)

    const reply = spawnSync('node', [
      'index.js', 'reply', '--session', sessionId, '--to', '#a3f19c2e', '--status', 'applied', '--text', 'Spacing fixed'
    ], { env: { ...process.env, ...env }, encoding: 'utf-8' })
    expect(reply.status).toBe(0)

    const second = await reviewRound(image, env)
    expect(second.stdout).toContain(`Session: ${sessionId} (round 2)`)
  }, 30_000)

  it('serves last round with its reply, exactly when the image is unchanged and as a ghost after an edit', async () => {
    const first = await reviewRound(image, env)
    const sessionId = first.stdout.match(/Session: ([0-9a-f]{12})/)[1]
    spawnSync('node', ['index.js', 'reply', '--session', sessionId, '--to', 'a3f19c2e', '--status', 'applied', '--text', 'Spacing fixed'], {
      env: { ...process.env, ...env }, encoding: 'utf-8'
    })

    const unchanged = await threadsOfNextRound(image, env)
    expect(unchanged).toMatchObject({ sessionId, round: 1, threads: [{ handle: 'a3f19c2e', anchor: 'exact', replies: [{ status: 'applied' }] }] })

    await writeFile(image, makeFixturePng(40, 30, '#aa0000'))
    expect((await threadsOfNextRound(image, env)).threads[0].anchor).toBe('ghost')
  }, 30_000)

  it('opens sessions for videos and PDFs too, refusing an unknown named one before loading anything', async () => {
    for (const name of ['clip.mp4', 'deck.pdf']) {
      const file = join(dir, name)
      await writeFile(file, 'x')
      const result = spawnSync('node', ['index.js', '--session', 'aaaaaaaaaaaa', file], {
        env: { ...process.env, ...env, ANNOTAITR_NO_OPEN: '1' }, encoding: 'utf-8', timeout: 10_000
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('No review session aaaaaaaaaaaa')
    }
  })

  it('still prints the decision when the session cannot be saved', async () => {
    const blocked = join(dir, 'not-a-dir')
    await writeFile(blocked, '')
    const round = await reviewRound(image, { ANNOTAITR_SESSION_DIR: blocked })
    expect(round.code).toBe(0)
    expect(round.stdout).toContain('[#a3f19c2e]')
    expect(round.stdout).not.toContain('Session:')
  }, 30_000)

  it('carries a thread the reviewer answered into the next round and shows the exchange', async () => {
    const first = await reviewRound(image, env)
    const sessionId = first.stdout.match(/Session: ([0-9a-f]{12})/)[1]
    spawnSync('node', ['index.js', 'reply', '--session', sessionId, '--to', 'a3f19c2e', '--status', 'question', '--text', 'Green or blue?'], {
      env: { ...process.env, ...env }, encoding: 'utf-8'
    })

    const second = startCli([image], env)
    const url = await second.url
    const post = (path, body) => fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    expect((await post('/api/threads/a3f19c2e/replies', { text: 'Green' })).status).toBe(200)
    await post('/api/feedback', {})
    expect(await second.exited).toBe(0)
    const out = second.stdout()
    expect(out).toMatch(/^Feedback: 1 reply to round 1, no new marks\./)
    expect(out).toContain('## Replies to round 1')
    expect(out).toContain('Agent (question): Green or blue?\nReviewer: Green\n')
    expect(out).toContain(`Session: ${sessionId} (round 2)`)

    const reply = spawnSync('node', ['index.js', 'reply', '--session', sessionId, '--to', 'a3f19c2e', '--status', 'applied', '--text', 'Now green'], {
      env: { ...process.env, ...env }, encoding: 'utf-8'
    })
    expect(reply.status).toBe(0)

    const third = await threadsOfNextRound(image, env)
    expect(third).toMatchObject({ round: 2, threads: [{ handle: 'a3f19c2e', number: null, origin: { round: 1, number: 1 } }] })
    expect(third.threads[0].replies.map((r) => r.author)).toEqual(['agent', 'human', 'agent'])
  }, 45_000)
})
