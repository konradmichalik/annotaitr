import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import { startCli } from './helpers/cli.js'

const A = 'a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d'
const B = 'b7210e44-1b4d-4f7a-9c3e-2d5f8a1b6c4d'
const DOC = '# Guide\n\nThe intro says hello to everyone.\n\nThis goodbye paragraph will go.\n'
// Keeps the second change in a hunk of its own, far from the marked line.
const FILLER = Array.from({ length: 8 }, (_, i) => `// line ${i + 3}\n`).join('')
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' }

const note = (id, blockId, originalText, text) => ({ id, type: 'COMMENT', blockId, startOffset: 0, endOffset: originalText.length, originalText, text, intent: 'change' })

function connect(cli) {
  return cli.url.then((url) => ({
    get: async (path) => (await (await fetch(`${url}${path}`)).json()).data,
    post: (path, body) => fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  }))
}

function reply(env, sessionId, to, status, text) {
  return spawnSync('node', ['index.js', 'reply', '--session', sessionId, '--to', to, '--status', status, '--text', text], {
    env: { ...process.env, ...env }, encoding: 'utf-8'
  })
}

describe('a markdown review session across rounds', () => {
  let dir
  let doc
  let env

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-md-session-it-'))
    doc = join(dir, 'guide.md')
    await writeFile(doc, DOC)
    env = { ANNOTAITR_SESSION_DIR: join(dir, 'sessions') }
  })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('carries replied threads into round 2: one moved with the edit, one gone, sent as replies alone', async () => {
    const first = startCli([doc], env)
    const api1 = await connect(first)
    const { files: [file] } = await api1.get('/api/files')
    const blocks = [
      { id: 'block-1', type: 'paragraph', startLine: 3, content: 'The intro says hello to everyone.' },
      { id: 'block-2', type: 'paragraph', startLine: 5, content: 'This goodbye paragraph will go.' }
    ]
    await api1.post('/api/feedback', { files: [{ path: file.path, blocks, annotations: [note(A, 'block-1', 'intro says hello', 'Friendlier'), note(B, 'block-2', 'goodbye paragraph', 'Drop it')] }] })
    expect(await first.exited).toBe(0)
    const sessionId = first.stdout().match(/Session: ([0-9a-f]{12}) \(round 1\)/)[1]
    const stored = JSON.parse(await readFile(join(dir, 'sessions', `${sessionId}.json`), 'utf-8'))
    expect(stored.target).toMatchObject({ kind: 'markdown', files: [{ path: doc, content: DOC }] })
    expect(stored.threads[0]).toMatchObject({ handle: 'a3f19c2e', file: doc, anchor: { quote: 'intro says hello', where: 'Line 3' } })

    expect(reply(env, sessionId, 'a3f19c2e', 'question', 'Warmer or shorter?').status).toBe(0)
    expect(reply(env, sessionId, 'b7210e44', 'applied', 'Removed it').status).toBe(0)
    await writeFile(doc, '# Guide\n\nA new opening line.\n\nThe intro says hello to everyone.\n')

    const second = startCli([doc], env)
    const api2 = await connect(second)
    const { round, threads } = await api2.get('/api/threads')
    expect(round).toBe(1)
    expect(threads.map((t) => [t.handle, t.anchor, t.place?.line ?? null])).toEqual([['a3f19c2e', 'moved', 5], ['b7210e44', 'orphan', null]])
    expect((await api2.post('/api/threads/a3f19c2e/replies', { text: 'Warmer' })).status).toBe(200)
    expect((await api2.post('/api/threads/b7210e44/replies', { text: 'Thanks' })).status).toBe(200)
    await api2.post('/api/feedback', { files: [{ path: file.path, blocks: [], annotations: [] }] })
    expect(await second.exited).toBe(0)
    const out = second.stdout()
    expect(out).toMatch(/^Feedback: 2 replies to round 1, no new notes\.\n/)
    expect(out).toContain(`### [#a3f19c2e] Text (Line 5, ${file.path})\nSelected: \`intro says hello\`\n> Round 1, note 1 (Line 3): Friendlier\nAgent (question): Warmer or shorter?\nReviewer: Warmer\n`)
    expect(out).toContain('### [#b7210e44] Text (no longer in the document)\nSelected: `goodbye paragraph`\n> Round 1, note 2 (Line 5): Drop it\n')
    expect(out).toContain(`Session: ${sessionId} (round 2). Reply per note with:`)
  }, 45_000)

  it('finds a note in round 3 by the text around it in round 2, after that text was edited', async () => {
    await writeFile(doc, '# Guide\n\nAlpha one says hello there.\n')
    const first = startCli([doc], env)
    const api1 = await connect(first)
    const { files: [file] } = await api1.get('/api/files')
    const blocks = [{ id: 'block-1', type: 'paragraph', startLine: 3, content: 'Alpha one says hello there.' }]
    await api1.post('/api/feedback', { files: [{ path: file.path, blocks, annotations: [note(A, 'block-1', 'says hello', 'Friendlier')] }] })
    await first.exited
    const sessionId = first.stdout().match(/Session: ([0-9a-f]{12})/)[1]
    reply(env, sessionId, 'a3f19c2e', 'question', 'How friendly?')

    // Round 2: the words around the quote change, the quote itself is still unique.
    await writeFile(doc, '# Guide\n\nBravo two says hello again.\n')
    const second = startCli([doc], env)
    const api2 = await connect(second)
    expect((await api2.get('/api/threads')).threads[0]).toMatchObject({ anchor: 'moved' })
    await api2.post('/api/threads/a3f19c2e/replies', { text: 'Very' })
    await api2.post('/api/feedback', { files: [{ path: file.path, blocks: [], annotations: [] }] })
    await second.exited
    reply(env, sessionId, 'a3f19c2e', 'applied', 'Made it warmer')

    // Round 3: the quote now shows twice; only round 2's context tells them apart.
    await writeFile(doc, '# Guide\n\nBravo two says hello again.\n\nCharlie three says hello later.\n')
    const third = startCli([doc], env)
    const api3 = await connect(third)
    expect((await api3.get('/api/threads')).threads[0]).toMatchObject({ handle: 'a3f19c2e', anchor: 'moved', place: { line: 3 } })
    third.child.kill()
    await third.exited
  }, 60_000)

  it('prints an approval with a new note first, then the replies, then the session line', async () => {
    const first = startCli([doc], env)
    const api1 = await connect(first)
    const { files: [file] } = await api1.get('/api/files')
    const blocks = [{ id: 'block-1', type: 'paragraph', startLine: 3, content: 'The intro says hello to everyone.' }]
    await api1.post('/api/feedback', { files: [{ path: file.path, blocks, annotations: [note(A, 'block-1', 'intro says hello', 'Friendlier')] }] })
    await first.exited
    const sessionId = first.stdout().match(/Session: ([0-9a-f]{12})/)[1]
    reply(env, sessionId, 'a3f19c2e', 'applied', 'Warmer now')

    const second = startCli([doc], env)
    const api2 = await connect(second)
    await api2.post('/api/threads/a3f19c2e/replies', { text: 'Thanks' })
    const goodbye = [{ id: 'block-2', type: 'paragraph', startLine: 5, content: 'This goodbye paragraph will go.' }]
    await api2.post('/api/approve', { files: [{ path: file.path, blocks: goodbye, annotations: [{ ...note(B, 'block-2', 'goodbye paragraph', 'Fine to keep'), number: 1 }] }] })
    await second.exited
    const out = second.stdout()
    expect(out).toMatch(/^APPROVED WITH NOTES: 1 note/)
    const [notes, replies, session] = ['[#b7210e44]', '## Replies to round 1', `Session: ${sessionId} (round 2)`].map((part) => out.indexOf(part))
    expect(notes).toBeGreaterThan(0)
    expect(replies).toBeGreaterThan(notes)
    expect(session).toBeGreaterThan(replies)
    expect(out).toContain('Agent (applied): Warmer now\nReviewer: Thanks\n')
  }, 45_000)

  it('approves the unchanged file with replies alone and keeps the exact place', async () => {
    const first = startCli([doc], env)
    const api1 = await connect(first)
    const { files: [file] } = await api1.get('/api/files')
    const blocks = [{ id: 'block-1', type: 'paragraph', startLine: 3, content: 'The intro says hello to everyone.' }]
    await api1.post('/api/feedback', { files: [{ path: file.path, blocks, annotations: [note(A, 'block-1', 'intro says hello', 'Friendlier')] }] })
    await first.exited
    const sessionId = first.stdout().match(/Session: ([0-9a-f]{12})/)[1]
    reply(env, sessionId, 'a3f19c2e', 'declined', 'It is friendly enough')

    const second = startCli([doc], env)
    const api2 = await connect(second)
    expect((await api2.get('/api/threads')).threads[0]).toMatchObject({ anchor: 'exact', place: { where: 'Line 3', line: 3 } })
    await api2.post('/api/threads/a3f19c2e/replies', { text: 'Fine' })
    await api2.post('/api/approve', {})
    await second.exited
    expect(second.stdout()).toMatch(/^APPROVED WITH NOTES: 1 reply to round 1\. The target is approved as-is\./)
    expect(second.stdout()).toContain(`### [#a3f19c2e] Text (Line 3, ${file.path})`)
  }, 45_000)
})

describe('a changes review session across a new commit', () => {
  let repo
  let env
  const git = (...args) => execFileSync('git', args, { cwd: repo, env: gitEnv })

  beforeEach(async () => {
    repo = await realpath(await mkdtemp(join(tmpdir(), 'annotaitr-changes-session-it-')))
    env = { ANNOTAITR_SESSION_DIR: join(repo, '..', `${repo.split('/').pop()}-sessions`) }
    git('init', '-q', '-b', 'main')
    await writeFile(join(repo, 'a.js'), `const a = 1\nconst b = 2\n${FILLER}const far = 1\n`)
    git('add', '.')
    git('commit', '-q', '-m', 'init')
    git('switch', '-q', '-c', 'feature/x')
    await writeFile(join(repo, 'a.js'), `const a = 1\nconst b = 3\n${FILLER}const far = 2\n`)
    git('commit', '-q', '-am', 'feat: b is three')
  })
  afterEach(async () => {
    await rm(repo, { recursive: true, force: true })
    await rm(env.ANNOTAITR_SESSION_DIR, { recursive: true, force: true })
  })

  it('keeps the session on the branch and finds the marked line again in the new walkthrough', async () => {
    const first = startCli(['changes', '--base', 'main'], env, { cwd: repo })
    const api1 = await connect(first)
    const { files: [walkthrough] } = await api1.get('/api/files')
    expect(walkthrough.content).toContain('+const b = 3')
    await api1.post('/api/feedback', { files: [{ path: walkthrough.path, blocks: [], annotations: [note(A, 'block-9', 'const b = 3', 'Why three?')] }] })
    expect(await first.exited).toBe(0)
    const sessionId = first.stdout().match(/Session: ([0-9a-f]{12}) \(round 1\)/)[1]
    const stored = JSON.parse(await readFile(join(env.ANNOTAITR_SESSION_DIR, `${sessionId}.json`), 'utf-8'))
    // The session keeps the selected code with a little context to find it again, never the walkthrough.
    expect(stored.target).toEqual({ kind: 'changes', label: expect.any(String), files: [{ path: expect.any(String), contentHash: expect.any(String) }] })
    expect(stored.threads[0].anchor).toMatchObject({ quote: 'const b = 3' })
    expect(stored.threads[0].anchor.prefix.length).toBeLessThanOrEqual(32)
    expect(stored.threads[0].anchor.suffix.length).toBeLessThanOrEqual(32)
    const raw = await readFile(join(env.ANNOTAITR_SESSION_DIR, `${sessionId}.json`), 'utf-8')
    expect(raw).not.toContain(JSON.stringify(walkthrough.content).slice(1, -1))
    expect(raw).not.toContain('far')
    expect(reply(env, sessionId, 'a3f19c2e', 'question', 'Three or four?').status).toBe(0)

    await writeFile(join(repo, 'b.js'), 'export {}\n')
    git('add', '.')
    git('commit', '-q', '-m', 'feat: add b')

    const second = startCli(['changes', '--base', 'main'], env, { cwd: repo })
    const api2 = await connect(second)
    const { threads } = await api2.get('/api/threads')
    expect(threads[0]).toMatchObject({ handle: 'a3f19c2e', anchor: 'moved', place: { where: 'new Line 2 in a.js' } })
    await api2.post('/api/threads/a3f19c2e/replies', { text: 'Three' })
    await api2.post('/api/feedback', { files: [{ path: walkthrough.path, blocks: [], annotations: [] }] })
    expect(await second.exited).toBe(0)
    expect(second.stdout()).toContain('### [#a3f19c2e] Text (new Line 2 in a.js)\n')
    expect(second.stdout()).toContain(`Session: ${sessionId} (round 2)`)
  }, 60_000)
})
