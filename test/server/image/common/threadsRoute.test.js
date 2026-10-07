import { describe, it, expect, afterEach } from 'vitest'
import express from 'express'
import { createReplyStore } from '../../../../server/core/session/replyStore.js'
import { createThreadsRouter, videoDuration } from '../../../../server/image/common/threadsRoute.js'

const box = { type: 'box', geometry: { x: 1, y: 1, width: 5, height: 5 }, text: 'Fix' }
const session = {
  sessionId: '2f8c1a9e04b7',
  target: { kind: 'file', label: 'a.png' },
  fingerprint: 'sha256:a',
  previous: { round: 1, fingerprint: 'sha256:a', threads: [{ handle: 'a3f19c2e', number: 1, annotation: box, element: null, replies: [] }] }
}

describe('threads route', () => {
  let server
  afterEach(() => server?.close())

  async function serve(router) {
    const app = express()
    app.use(express.json())
    app.use(router)
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    return `http://127.0.0.1:${server.address().port}`
  }

  it('answers the anchored previous round', async () => {
    const url = await serve(createThreadsRouter({ session, current: () => ({ width: 50, height: 50 }) }))
    const body = await (await fetch(`${url}/api/threads`)).json()
    expect(body).toEqual({ success: true, data: { sessionId: '2f8c1a9e04b7', round: 1, threads: [{ ...session.previous.threads[0], anchor: 'exact', reason: null }] } })
  })

  it('stores a reviewer reply and serves it as pending', async () => {
    const withStore = { ...session, replies: createReplyStore(session.previous) }
    const url = await serve(createThreadsRouter({ session: withStore, current: () => ({ width: 50, height: 50 }) }))
    const res = await fetch(`${url}/api/threads/a3f19c2e/replies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Green' })
    })
    expect(res.status).toBe(200)
    const { data } = await (await fetch(`${url}/api/threads`)).json()
    expect(data.threads[0].replies).toMatchObject([{ author: 'human', text: 'Green', pending: true }])
  })

  it('rejects a reply for a handle that is not in the last round', async () => {
    const withStore = { ...session, replies: createReplyStore(session.previous) }
    const url = await serve(createThreadsRouter({ session: withStore, current: () => ({}) }))
    const res = await fetch(`${url}/api/threads/deadbeef/replies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x' })
    })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ success: false, error: 'No thread #deadbeef in round 1' })
    expect(withStore.replies.count()).toBe(0)
  })

  it('rejects blank and overlong reply text with the store message', async () => {
    const withStore = { ...session, replies: createReplyStore(session.previous) }
    const url = await serve(createThreadsRouter({ session: withStore, current: () => ({}) }))
    const post = (text) => fetch(`${url}/api/threads/a3f19c2e/replies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text })
    })
    const blank = await post('   ')
    expect(blank.status).toBe(400)
    expect(await blank.json()).toEqual({ success: false, error: 'A reply needs text' })
    const long = await post('x'.repeat(4001))
    expect(long.status).toBe(400)
    expect(await long.json()).toEqual({ success: false, error: 'Reply text is longer than 4000 characters' })
    expect(withStore.replies.count()).toBe(0)
  })

  it('removes a pending reply', async () => {
    const withStore = { ...session, replies: createReplyStore(session.previous) }
    const url = await serve(createThreadsRouter({ session: withStore, current: () => ({}) }))
    const posted = await (await fetch(`${url}/api/threads/a3f19c2e/replies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x' })
    })).json()
    expect((await fetch(`${url}/api/threads/a3f19c2e/replies/${posted.data.reply.id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await fetch(`${url}/api/threads/a3f19c2e/replies/${posted.data.reply.id}`, { method: 'DELETE' })).status).toBe(404)
  })

  it('rejects replies when there is no session', async () => {
    const url = await serve(createThreadsRouter({ session: null, current: () => ({}) }))
    const res = await fetch(`${url}/api/threads/a3f19c2e/replies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x' })
    })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ success: false, error: 'No review session to reply in' })
  })

  it('answers an empty list without a previous round', async () => {
    const url = await serve(createThreadsRouter({ session: { ...session, previous: null }, current: () => ({ kind: 'file' }) }))
    expect((await (await fetch(`${url}/api/threads`)).json()).data).toEqual({ sessionId: '2f8c1a9e04b7', round: null, threads: [] })
  })

  it('answers an empty list without any session', async () => {
    const url = await serve(createThreadsRouter({ session: null, current: () => ({ kind: 'file' }) }))
    expect((await (await fetch(`${url}/api/threads`)).json()).data).toEqual({ sessionId: null, round: null, threads: [] })
  })

  it('reads the current facts on every request, so a recapture is reflected', async () => {
    let width = 50
    const url = await serve(createThreadsRouter({
      session: { ...session, target: { kind: 'url', label: 'http://x/' } },
      current: () => ({ width, height: 50 })
    }))
    expect((await (await fetch(`${url}/api/threads`)).json()).data.threads[0].anchor).toBe('ghost')
    width = 1
    expect((await (await fetch(`${url}/api/threads`)).json()).data.threads[0].anchor).toBe('orphan')
  })

  it('takes kind and fingerprint from the session, so a URL is never exact even with matching fingerprints', async () => {
    const url = await serve(createThreadsRouter({
      session: { ...session, target: { kind: 'url', label: 'http://x/' } },
      current: () => ({ width: 50, height: 50 })
    }))
    expect((await (await fetch(`${url}/api/threads`)).json()).data.threads[0].anchor).toBe('ghost')
  })

  it('waits for a fingerprint that is still being computed', async () => {
    const url = await serve(createThreadsRouter({
      session: { ...session, fingerprint: Promise.resolve('sha256:a') },
      current: () => ({ width: 50, height: 50 })
    }))
    expect((await (await fetch(`${url}/api/threads`)).json()).data.threads[0].anchor).toBe('exact')
  })
})

describe('videoDuration', () => {
  it('takes a positive number of seconds from the query and ignores anything else', () => {
    expect(videoDuration({ query: { duration: '12.5' } })).toBe(12.5)
    for (const duration of [undefined, 'abc', '-3', '0', 'Infinity']) {
      expect(videoDuration({ query: { duration } })).toBeUndefined()
    }
  })
})
