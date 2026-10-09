import { describe, it, expect, afterEach } from 'vitest'
import express from 'express'
import { createChangesRouter } from '../../../server/changes/routes.js'

let server

async function serve(fullDiff) {
  const app = express()
  app.use(createChangesRouter(fullDiff))
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  return `http://127.0.0.1:${server.address().port}`
}

afterEach(() => { server?.close() })

describe('GET /api/changes/full', () => {
  it('returns the whole diff of a file of the walkthrough', async () => {
    const url = await serve(async (path) => (path === 'a.js' ? '@@ -1 +1 @@\n-a\n+b' : null))
    const body = await (await fetch(`${url}/api/changes/full?path=a.js`)).json()
    expect(body).toEqual({ success: true, data: { diff: '@@ -1 +1 @@\n-a\n+b' } })
  })

  it('answers 404 for any other path, a repeated parameter or none', async () => {
    const asked = []
    const url = await serve(async (path) => { asked.push(path); return null })
    expect((await fetch(`${url}/api/changes/full?path=b.js`)).status).toBe(404)
    expect((await fetch(`${url}/api/changes/full?path=a.js&path=b.js`)).status).toBe(404)
    expect((await fetch(`${url}/api/changes/full`)).status).toBe(404)
    expect(asked).toEqual(['b.js'])
  })

  it('reports a failure without git\'s message, which names local paths', async () => {
    const url = await serve(async () => { throw new Error('fatal: /Users/someone/repo: bad object') })
    const res = await fetch(`${url}/api/changes/full?path=a.js`)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Could not read the whole file')
  })
})
