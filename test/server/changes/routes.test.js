import { describe, it, expect, afterEach } from 'vitest'
import express from 'express'
import { createChangesRouter } from '../../../server/changes/routes.js'

let server

async function serve(fullDiff, repo) {
  const app = express()
  app.use(createChangesRouter(fullDiff, repo))
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

describe('the files of the repository', () => {
  const none = async () => null
  const files = [{ path: 'a.js', omitted: null }, { path: 'package-lock.json', omitted: 'lock file' }]

  it('lists them', async () => {
    const url = await serve(none, { list: async () => ({ files, truncated: false }), read: none })
    const body = await (await fetch(`${url}/api/changes/files`)).json()
    expect(body).toEqual({ success: true, data: { files, truncated: false } })
  })

  it('returns a file by its exact path', async () => {
    const url = await serve(none, { list: none, read: async (path) => (path === 'a.js' ? { path, content: 'one\n' } : null) })
    const body = await (await fetch(`${url}/api/changes/file?path=a.js`)).json()
    expect(body).toEqual({ success: true, data: { path: 'a.js', content: 'one\n' } })
  })

  it('answers 404 for any other path, a repeated parameter or none', async () => {
    const asked = []
    const url = await serve(none, { list: none, read: async (path) => { asked.push(path); return null } })
    expect((await fetch(`${url}/api/changes/file?path=b.js`)).status).toBe(404)
    expect((await fetch(`${url}/api/changes/file?path=a.js&path=b.js`)).status).toBe(404)
    expect((await fetch(`${url}/api/changes/file`)).status).toBe(404)
    expect(asked).toEqual(['b.js'])
  })

  it('reports a failure without git\'s message, which names local paths', async () => {
    const failing = async () => { throw new Error('fatal: /Users/someone/repo: bad object') }
    const url = await serve(none, { list: failing, read: failing })
    const list = await fetch(`${url}/api/changes/files`)
    const file = await fetch(`${url}/api/changes/file?path=a.js`)
    expect([list.status, file.status]).toEqual([500, 500])
    expect(JSON.stringify([await list.json(), await file.json()])).not.toContain('/Users/someone')
  })

  it('offers neither route without a repository', async () => {
    const url = await serve(none)
    expect((await fetch(`${url}/api/changes/files`)).status).toBe(404)
    expect((await fetch(`${url}/api/changes/file?path=a.js`)).status).toBe(404)
  })
})
