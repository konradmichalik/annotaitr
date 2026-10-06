import { describe, it, expect, afterEach } from 'vitest'
import express from 'express'
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
    app.use(router)
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    return `http://127.0.0.1:${server.address().port}`
  }

  it('answers the anchored previous round', async () => {
    const url = await serve(createThreadsRouter({ session, current: () => ({ kind: 'file', fingerprint: 'sha256:a', width: 50, height: 50 }) }))
    const body = await (await fetch(`${url}/api/threads`)).json()
    expect(body).toEqual({ success: true, data: { sessionId: '2f8c1a9e04b7', round: 1, threads: [{ ...session.previous.threads[0], anchor: 'exact', reason: null }] } })
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
      current: () => ({ kind: 'url', fingerprint: null, width, height: 50 })
    }))
    expect((await (await fetch(`${url}/api/threads`)).json()).data.threads[0].anchor).toBe('ghost')
    width = 1
    expect((await (await fetch(`${url}/api/threads`)).json()).data.threads[0].anchor).toBe('orphan')
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
