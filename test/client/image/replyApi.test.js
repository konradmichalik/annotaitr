import { describe, it, expect, vi, afterEach } from 'vitest'
import { postReply, removeReply } from '../../../client/image/src/threads/replyApi.js'

const respond = (status, body) => vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })

afterEach(() => { vi.unstubAllGlobals() })

describe('postReply', () => {
  it('posts the text and returns the stored reply', async () => {
    const fetchMock = respond(200, { success: true, data: { reply: { id: 'r1', text: 'Green' } } })
    vi.stubGlobal('fetch', fetchMock)
    expect(await postReply('a3f19c2e', 'Green')).toEqual({ reply: { id: 'r1', text: 'Green' } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/threads/a3f19c2e/replies')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ text: 'Green' })
  })

  it('returns the server message on a rejected reply', async () => {
    vi.stubGlobal('fetch', respond(400, { success: false, error: 'Reply is longer than 4000 characters' }))
    expect(await postReply('a3f19c2e', 'x')).toEqual({ error: 'Reply is longer than 4000 characters' })
  })

  it('falls back to the status when the body has no message', async () => {
    vi.stubGlobal('fetch', respond(404, {}))
    expect(await postReply('a3f19c2e', 'x')).toEqual({ error: 'Server responded with 404' })
  })

  it('reports an unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    expect(await postReply('a3f19c2e', 'x')).toEqual({ error: 'Could not reach the annotator server' })
  })
})

describe('removeReply', () => {
  it('deletes the reply by id', async () => {
    const fetchMock = respond(200, { success: true, data: {} })
    vi.stubGlobal('fetch', fetchMock)
    expect(await removeReply('a3f19c2e', 'r 1')).toEqual({ removed: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/threads/a3f19c2e/replies/r%201')
    expect(init.method).toBe('DELETE')
  })

  it('returns the server message when the reply is gone', async () => {
    vi.stubGlobal('fetch', respond(404, { success: false, error: 'No such reply' }))
    expect(await removeReply('a3f19c2e', 'r1')).toEqual({ error: 'No such reply' })
  })

  it('reports an unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    expect(await removeReply('a3f19c2e', 'r1')).toEqual({ error: 'Could not reach the annotator server' })
  })
})
