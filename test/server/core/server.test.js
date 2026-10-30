import { describe, it, expect, afterEach } from 'vitest'
import { request } from 'node:http'
import { startAnnotatorServer, isAllowedHost, isAllowedWrite } from '../../../server/core/server.js'

function get(port, { host, method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1', port, path: '/api/ping', method,
      headers: { ...(host ? { Host: host } : {}), ...headers }
    }, (res) => {
      res.resume()
      res.on('end', () => resolve(res))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('startAnnotatorServer request guard', () => {
  let server

  afterEach(() => {
    server?.stop()
    server = null
  })

  async function start() {
    server = await startAnnotatorServer({
      htmlContent: '<p>ok</p>',
      mountRoutes(app) { app.get('/api/ping', (_req, res) => res.json({ ok: true })) }
    })
    return server.port
  }

  it('answers its own origin without any CORS header', async () => {
    const port = await start()
    const res = await get(port, { headers: { Origin: 'https://evil.example' } })
    expect(res.statusCode).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('does not answer a cross-origin preflight with permission', async () => {
    const port = await start()
    const res = await get(port, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'PUT' }
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('accepts localhost on the bound port', async () => {
    const port = await start()
    expect((await get(port, { host: `localhost:${port}` })).statusCode).toBe(200)
  })

  it('rejects a foreign Host, as sent after DNS rebinding', async () => {
    const port = await start()
    expect((await get(port, { host: `evil.example:${port}` })).statusCode).toBe(403)
  })

  describe('write requests', () => {
    async function startWithPost() {
      server = await startAnnotatorServer({
        htmlContent: '<p>ok</p>',
        mountRoutes(app) { app.post('/api/ping', (_req, res) => res.json({ ok: true })) }
      })
      return server.port
    }

    it('rejects a POST from another website', async () => {
      const port = await startWithPost()
      const origin = await get(port, { method: 'POST', headers: { Origin: 'https://evil.example' } })
      const site = await get(port, { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } })
      expect(origin.statusCode).toBe(403)
      expect(site.statusCode).toBe(403)
    })

    it('accepts a POST from its own page', async () => {
      const port = await startWithPost()
      const res = await get(port, {
        method: 'POST',
        headers: { Origin: `http://127.0.0.1:${port}`, 'Sec-Fetch-Site': 'same-origin' }
      })
      expect(res.statusCode).toBe(200)
    })

    it('accepts a POST without browser headers, as sent by the CLI', async () => {
      const port = await startWithPost()
      expect((await get(port, { method: 'POST' })).statusCode).toBe(200)
    })
  })
})

describe('isAllowedWrite', () => {
  const own = { host: '127.0.0.1:4000' }

  it('lets safe methods through whatever they carry', () => {
    expect(isAllowedWrite('GET', { ...own, origin: 'https://evil.example' })).toBe(true)
    expect(isAllowedWrite('OPTIONS', { ...own, 'sec-fetch-site': 'cross-site' })).toBe(true)
  })

  it('rejects another port on the same machine, which browsers call same-site', () => {
    expect(isAllowedWrite('POST', { ...own, 'sec-fetch-site': 'same-site' })).toBe(false)
    expect(isAllowedWrite('POST', { ...own, origin: 'http://127.0.0.1:4001' })).toBe(false)
  })

  it('rejects an HTTPS Origin, since the server only speaks HTTP', () => {
    expect(isAllowedWrite('POST', { ...own, origin: 'https://127.0.0.1:4000' })).toBe(false)
  })

  it('rejects an opaque or malformed Origin', () => {
    expect(isAllowedWrite('POST', { ...own, origin: 'null' })).toBe(false)
    expect(isAllowedWrite('POST', { ...own, origin: 'not a url' })).toBe(false)
  })

  it('rejects when Fetch Metadata and Origin disagree', () => {
    expect(isAllowedWrite('POST', { ...own, 'sec-fetch-site': 'same-origin', origin: 'https://evil.example' })).toBe(false)
  })

  it('accepts the page itself', () => {
    expect(isAllowedWrite('POST', { ...own, 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:4000' })).toBe(true)
  })
})

describe('isAllowedHost', () => {
  it('allows loopback names and the bind host on the right port', () => {
    expect(isAllowedHost('127.0.0.1:4000', 4000, '127.0.0.1')).toBe(true)
    expect(isAllowedHost('LOCALHOST:4000', 4000, '127.0.0.1')).toBe(true)
    expect(isAllowedHost('[::1]:4000', 4000, '::1')).toBe(true)
    expect(isAllowedHost('192.168.1.5:4000', 4000, '192.168.1.5')).toBe(true)
  })

  it('reads a Host without port as the HTTP default port 80', () => {
    expect(isAllowedHost('localhost', 80, '127.0.0.1')).toBe(true)
    expect(isAllowedHost('localhost', 4000, '127.0.0.1')).toBe(false)
  })

  it('rejects other names, other ports and a missing header', () => {
    expect(isAllowedHost('evil.example:4000', 4000, '127.0.0.1')).toBe(false)
    expect(isAllowedHost('127.0.0.1:4001', 4000, '127.0.0.1')).toBe(false)
    expect(isAllowedHost('127.0.0.1', 4000, '127.0.0.1')).toBe(false)
    expect(isAllowedHost(undefined, 4000, '127.0.0.1')).toBe(false)
  })

  it('allows any name when bound to every interface on purpose', () => {
    expect(isAllowedHost('my-laptop.local:4000', 4000, '0.0.0.0')).toBe(true)
    expect(isAllowedHost('my-laptop.local:4000', 4000, '::')).toBe(true)
  })
})
