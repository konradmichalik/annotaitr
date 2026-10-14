import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildMarkdownServer } from '../../../server/markdown/adapter.js'
import { createReplyStore } from '../../../server/core/session/replyStore.js'
import { createAnchor } from '../../../server/markdown/anchorThreads.js'

const DOC = '# Title\n\nThe intro says hello.\n\nSecond paragraph.\n'
const sha = (text) => createHash('sha256').update(text).digest('hex')
const UUID = 'a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d'
const OTHER = 'b7210e44-1b4d-4f7a-9c3e-2d5f8a1b6c4d'
const block = { id: 'block-1', type: 'paragraph', startLine: 3, content: 'The intro says hello.' }
const note = { id: UUID, type: 'COMMENT', blockId: 'block-1', startOffset: 4, endOffset: 14, originalText: 'intro says', text: 'Shorter', intent: 'change' }

const post = (url, path, body) => fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('markdown routes with a review session', () => {
  let dir
  let path
  let server

  const previousRound = () => {
    const anchor = createAnchor(note, block, { content: DOC, contentHash: sha(DOC) })
    return {
      schemaVersion: 1, sessionId: '2f8c1a9e04b7', round: 1, writtenAt: 1, target: { kind: 'markdown' },
      threads: [{ handle: 'a3f19c2e', number: 1, annotation: note, element: null, file: path, anchor, replies: [{ author: 'agent', status: 'question', text: 'How short?' }] }]
    }
  }
  const start = async (previous = previousRound()) => {
    server = await buildMarkdownServer({ filePaths: [path], session: { sessionId: '2f8c1a9e04b7', previous, replies: createReplyStore(previous) } })
    return server.url
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-md-session-'))
    path = join(dir, 'a.md')
    await writeFile(path, DOC)
  })
  afterEach(async () => {
    server?.stop()
    await rm(dir, { recursive: true, force: true })
  })

  it('serves last round placed in the current file, with pending replies', async () => {
    const url = await start()
    expect((await post(url, '/api/threads/a3f19c2e/replies', { text: 'Two lines' })).status).toBe(200)
    const body = await (await fetch(`${url}/api/threads`)).json()
    expect(body.data).toMatchObject({ sessionId: '2f8c1a9e04b7', round: 1 })
    expect(body.data.threads[0]).toMatchObject({ handle: 'a3f19c2e', anchor: 'exact', place: { path: expect.stringMatching(/a\.md$/), where: 'Line 3', line: 3, quote: 'intro says' } })
    expect(body.data.threads[0].replies.at(-1)).toMatchObject({ author: 'human', text: 'Two lines', pending: true })
  })

  it('sends replies alone as feedback, with the carried thread and where it is now', async () => {
    const url = await start()
    await post(url, '/api/threads/a3f19c2e/replies', { text: 'Two lines' })
    expect((await post(url, '/api/feedback', { files: [{ path: 'a.md', annotations: [], blocks: [] }] })).status).toBe(200)
    const decision = await server.waitForDecision()
    expect(decision).toMatchObject({ approved: false, repliesOnly: true, annotationCount: 1, replyCount: 1 })
    expect(decision.carried.map((t) => t.handle)).toEqual(['a3f19c2e'])
    expect(decision.places.a3f19c2e).toMatchObject({ anchor: 'exact', place: { where: 'Line 3' } })
  })

  it('freezes the replies at the decision so a late reply is refused', async () => {
    const url = await start()
    await post(url, '/api/threads/a3f19c2e/replies', { text: 'Two lines' })
    await post(url, '/api/approve', {})
    expect((await post(url, '/api/threads/a3f19c2e/replies', { text: 'Too late' })).status).toBe(409)
    const decision = await server.waitForDecision()
    expect(decision).toMatchObject({ approved: true, repliesOnly: true, replyCount: 1 })
  })

  it('records each new note with its file, its anchor and the reviewed content', async () => {
    const url = await start(null)
    const fresh = { ...note, id: OTHER, number: 1 }
    await post(url, '/api/feedback', { files: [{ path: 'a.md', annotations: [fresh], blocks: [block] }] })
    const decision = await server.waitForDecision()
    expect(decision.feedback).toContain('[#b7210e44]')
    expect(decision.annotations.map((a) => a.id)).toEqual([OTHER])
    expect(decision.threadFields[OTHER]).toEqual({ file: path, anchor: { quote: 'intro says', prefix: 'TitleThe', suffix: 'hello.Secondparagraph.', where: 'Line 3', contentHash: sha(DOC) } })
    expect(decision.files).toEqual([{ absolutePath: path, path: expect.stringMatching(/a\.md$/), content: DOC, contentHash: sha(DOC) }])
  })

  it('answers a malformed body with 400 and keeps waiting for a decision', async () => {
    const url = await start()
    expect((await post(url, '/api/feedback', { files: [{ annotations: 'x' }] })).status).toBe(400)
    expect((await post(url, '/api/approve', { files: [{ annotations: 'x' }] })).status).toBe(400)
    // The old single-file body is gone, no client sends it.
    expect((await post(url, '/api/feedback', { annotations: [], blocks: [] })).status).toBe(400)
    expect((await post(url, '/api/threads/a3f19c2e/replies', { text: 'Still open' })).status).toBe(200)
    await post(url, '/api/feedback', { files: [{ path: 'a.md', annotations: [], blocks: [] }] })
    expect(await server.waitForDecision()).toMatchObject({ repliesOnly: true, replyCount: 1 })
  })

  it('answers 500 with an empty round when last round cannot be placed', async () => {
    const broken = { ...previousRound(), threads: [{ ...previousRound().threads[0], anchor: { quote: 7 } }] }
    const url = await start(broken)
    const response = await fetch(`${url}/api/threads`)
    expect(response.status).toBe(500)
    expect((await response.json()).success).toBe(false)
  })

  it('prints notes and replies together when an approval keeps its notes', async () => {
    const url = await start()
    await post(url, '/api/threads/a3f19c2e/replies', { text: 'Two lines' })
    const fresh = { ...note, id: OTHER, number: 1 }
    await post(url, '/api/approve', { files: [{ path: 'a.md', annotations: [fresh], blocks: [block] }] })
    const decision = await server.waitForDecision()
    expect(decision).toMatchObject({ approved: true, annotationCount: 1, replyCount: 1 })
    expect(decision.repliesOnly).toBeUndefined()
    expect(decision.feedback).toContain('[#b7210e44]')
    expect(decision.carried.map((t) => t.handle)).toEqual(['a3f19c2e'])
  })

  it('never turns the agent\'s read-only notes into threads', async () => {
    const url = await start(null)
    const agentNote = { id: 'c0ffee12-1b4d-4f7a-9c3e-2d5f8a1b6c4d', type: 'NOTES', blockId: 'block-1', startOffset: 0, endOffset: 5, originalText: 'intro', text: 'Rewrote this' }
    const fresh = { ...note, id: OTHER, number: 1 }
    await post(url, '/api/feedback', { files: [{ path: 'a.md', annotations: [agentNote, fresh], blocks: [block] }] })
    const decision = await server.waitForDecision()
    expect(decision.annotations.map((a) => a.id)).toEqual([OTHER])
  })

  describe('the file as the reviewer saw it last round', () => {
    const OLD = '# Title\n\nThe intro said hi.\n'
    const withFiles = (files, target = { kind: 'markdown' }) => ({ ...previousRound(), round: 2, target: { ...target, files } })
    const filesOf = async (url) => (await (await fetch(`${url}/api/files`)).json()).data.files

    it('serves the content stored for the file when it changed since', async () => {
      const url = await start(withFiles([{ path, contentHash: sha(OLD), content: OLD }]))
      expect((await filesOf(url))[0].previousRound).toEqual({ round: 2, content: OLD })
    })

    it('serves nothing when the file is unchanged, unknown to last round or without stored content', async () => {
      expect((await filesOf(await start(withFiles([{ path, contentHash: sha(DOC), content: DOC }]))))[0].previousRound).toBeNull()
      server.stop()
      expect((await filesOf(await start(withFiles([{ path: join(dir, 'other.md'), contentHash: sha(OLD), content: OLD }]))))[0].previousRound).toBeNull()
      server.stop()
      expect((await filesOf(await start(withFiles([{ path, contentHash: sha(OLD) }]))))[0].previousRound).toBeNull()
      server.stop()
      expect((await filesOf(await start(null)))[0].previousRound).toBeNull()
    })

    it('serves nothing for a changes walkthrough, which already is a diff', async () => {
      server = await buildMarkdownServer({
        filePaths: [path], kind: 'changes',
        session: { sessionId: '2f8c1a9e04b7', previous: withFiles([{ path, contentHash: sha(OLD), content: OLD }], { kind: 'changes' }), replies: createReplyStore(null) }
      })
      expect((await filesOf(server.url))[0].previousRound).toBeNull()
    })
  })

  it('keeps printing "No annotations." for feedback without notes or replies', async () => {
    const url = await start(null)
    await post(url, '/api/feedback', { files: [{ path: 'a.md', annotations: [], blocks: [] }] })
    expect((await server.waitForDecision()).feedback).toBe('No annotations.')
  })
})
