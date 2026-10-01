import { describe, it, expect, afterEach } from 'vitest'
import { request } from 'node:http'
import { startAnnotatorServer, isAllowedHost } from '../../../server/core/server.js'

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
