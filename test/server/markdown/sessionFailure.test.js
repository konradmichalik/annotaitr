import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildMarkdownServer } from '../../../server/markdown/adapter.js'
import { createReplyStore } from '../../../server/core/session/replyStore.js'

vi.mock('../../../server/markdown/feedback.js', async (importOriginal) => ({
  ...(await importOriginal()),
  exportMultiFileFeedback: vi.fn(() => { throw new Error('cannot format') })
}))
vi.mock('../../../server/markdown/sessionDecision.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sessionFields: vi.fn(async () => { throw new Error('disk gone') })
}))

const post = (url, path, body) => fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('a decision that fails on the server', () => {
  let dir
  let server

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-md-session-fail-'))
    await writeFile(join(dir, 'a.md'), '# A\n')
    server = await buildMarkdownServer({ filePaths: [join(dir, 'a.md')], session: { sessionId: '2f8c1a9e04b7', previous: null, replies: createReplyStore(null) } })
  })
  afterEach(async () => {
    server?.stop()
    await rm(dir, { recursive: true, force: true })
  })

  it('answers 500 with the reason when the session fields cannot be read', async () => {
    const response = await post(server.url, '/api/approve', {})
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ success: false, error: 'disk gone' })
  })

  it('answers 500 when the feedback cannot be formatted, instead of leaving the request open', async () => {
    const response = await post(server.url, '/api/feedback', { files: [{ path: 'a.md', annotations: [], blocks: [] }] })
    expect(response.status).toBe(500)
  })
})
