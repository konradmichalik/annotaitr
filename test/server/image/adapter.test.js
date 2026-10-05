import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildImageServer } from '../../../server/image/adapter.js'
import { makeFixturePng } from '../../helpers/fixtureImage.js'
import { flattenAnnotations } from '../../../server/image/render.js'
import { writeAnnotatedImage } from '../../../server/image/output.js'

vi.mock('../../../server/image/render.js', async () => {
  const actual = await vi.importActual('../../../server/image/render.js')
  return { ...actual, flattenAnnotations: vi.fn(actual.flattenAnnotations) }
})

vi.mock('../../../server/image/output.js', async () => {
  const actual = await vi.importActual('../../../server/image/output.js')
  return { ...actual, writeAnnotatedImage: vi.fn(actual.writeAnnotatedImage) }
})

/**
 * Races `waitForDecision()` against a short timer so a test can assert the
 * decision promise is still pending after a handler throws, without hanging
 * forever waiting on a promise that (correctly) never resolves.
 */
async function isStillPending(server) {
  const result = await Promise.race([
    server.waitForDecision().then(() => 'settled'),
    new Promise((resolve) => setTimeout(() => resolve('pending'), 250))
  ])
  return result === 'pending'
}

describe('image annotator server', () => {
  let server

  afterEach(() => {
    server?.stop()
    server = null
  })

  async function start(overrides = {}) {
    server = await buildImageServer({
      imageBuffer: makeFixturePng(40, 30),
      imageWidth: 40,
      imageHeight: 30,
      origin: 'cli',
      ...overrides
    })
    return server
  }

  it('serves the source image as PNG', async () => {
    await start()
    const res = await fetch(`${server.url}/api/image`)
    expect(res.headers.get('content-type')).toBe('image/png')
    const bytes = await res.arrayBuffer()
    expect(bytes.byteLength).toBeGreaterThan(0)
  })

  it('serves a JPEG source image with the matching content-type, not a hardcoded PNG label', async () => {
    const { createCanvas } = await import('@napi-rs/canvas')
    const jpegBuffer = createCanvas(40, 30).toBuffer('image/jpeg')
    await start({ imageBuffer: jpegBuffer })
    const res = await fetch(`${server.url}/api/image`)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  })

  it('serves image metadata', async () => {
    await start()
    const res = await fetch(`${server.url}/api/meta`)
    const body = await res.json()
    expect(body.data).toEqual({ width: 40, height: 30, origin: 'cli', targetLabel: null, voiceNotes: false, capture: null })
  })

  it('serves the target label when provided', async () => {
    await start({ targetLabel: 'http://localhost:3000' })
    const res = await fetch(`${server.url}/api/meta`)
    const body = await res.json()
    expect(body.data.targetLabel).toBe('http://localhost:3000')
  })

  it('round-trips annotations through GET/POST', async () => {
    await start()
    const annotation = { id: 'a1', type: 'pin', geometry: { x: 5, y: 5 }, text: 'hi', color: '#e11d48' }

    const post = await fetch(`${server.url}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: [annotation] })
    })
    expect((await post.json()).data).toEqual({ saved: true, count: 1 })

    const get = await fetch(`${server.url}/api/annotations`)
    expect((await get.json()).data.annotations).toEqual([annotation])
  })

  it('rejects a non-array annotations payload', async () => {
    await start()
    const res = await fetch(`${server.url}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: 'nope' })
    })
    expect(res.status).toBe(400)
  })

  it('resolves a plain approval with no annotations', async () => {
    await start()
    const res = await fetch(`${server.url}/api/approve`, { method: 'POST' })
    expect((await res.json()).data.message).toBe('Approved')
    const decision = await server.waitForDecision()
    expect(decision.approved).toBe(true)
    expect(decision.output).toBe('APPROVED: No changes requested.\n')
  })

  it('resolves an approval-with-notes when annotations exist, and writes the flattened image', async () => {
    await start()
    await fetch(`${server.url}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: [{ id: 'a1', type: 'pin', geometry: { x: 5, y: 5 }, text: 'hi', color: '#e11d48' }] })
    })
    await fetch(`${server.url}/api/approve`, { method: 'POST' })
    const decision = await server.waitForDecision()
    expect(decision.approved).toBe(true)
    expect(decision.output).toContain('APPROVED WITH NOTES: 1 note.')
    expect(decision.annotationCount).toBe(1)
  })

  it('rejects a submit with zero annotations', async () => {
    await start()
    const res = await fetch(`${server.url}/api/feedback`, { method: 'POST' })
    expect(res.status).toBe(400)
  })

  it('resolves feedback (not approved) when annotations exist', async () => {
    await start()
    await fetch(`${server.url}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: [{ id: 'a1', type: 'box', geometry: { x: 0, y: 0, width: 10, height: 10 }, text: 'fix', color: '#e11d48' }] })
    })
    await fetch(`${server.url}/api/feedback`, { method: 'POST' })
    const decision = await server.waitForDecision()
    expect(decision.approved).toBe(false)
    expect(decision.output).toContain('1 annotation on the screenshot.')
    expect(decision.annotationCount).toBe(1)
  })

  it('serves the DOM map of a captured page, and an empty list for any other image', async () => {
    const domMap = [{ tag: 'a', role: 'button', name: 'Start trial', media: '', selector: 'a.cta', box: { x: 0, y: 0, width: 20, height: 20 } }]
    await start({ domMap })
    expect((await (await fetch(`${server.url}/api/elements`)).json()).data).toEqual({ elements: domMap })
    server.stop()
    await start()
    expect((await (await fetch(`${server.url}/api/elements`)).json()).data).toEqual({ elements: [] })
  })

  describe('recapturing a URL', () => {
    const desktop = { viewport: { width: 1920, height: 1080 }, delayMs: 0, section: null }
    const pin = { id: 'a1', type: 'pin', geometry: { x: 5, y: 5 }, text: 'hi', color: '#e11d48' }
    const post = (path, body) => fetch(`${server.url}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
    const fakeCapture = (width, height) => ({
      buffer: makeFixturePng(width, height), width, height,
      domMap: [{ tag: 'a', role: '', name: `at ${width}`, media: '', selector: 'a', heading: '', box: { x: 0, y: 0, width: 10, height: 10 } }]
    })

    it('reports the capture settings in /api/meta', async () => {
      await start({ captureSettings: desktop, recapture: vi.fn() })
      const meta = (await (await fetch(`${server.url}/api/meta`)).json()).data
      expect(meta.capture).toMatchObject({ ...desktop, description: 'desktop (1920×1080), full page' })
      expect(meta.capture.presets.mobile).toEqual({ width: 375, height: 812 })
    })

    it('swaps in the new screenshot, size and element map, and discards the annotations', async () => {
      const recapture = vi.fn().mockResolvedValue(fakeCapture(37, 81))
      await start({ captureSettings: desktop, recapture })
      await post('/api/annotations', { annotations: [pin] })
      const res = await post('/api/recapture', { viewport: 'tablet', delayMs: 300, section: { anchor: '#pricing' } })
      expect(res.status).toBe(200)
      const settings = { viewport: { width: 768, height: 1024 }, delayMs: 300, section: { anchor: '#pricing' } }
      expect(recapture).toHaveBeenCalledWith(settings)
      const meta = (await (await fetch(`${server.url}/api/meta`)).json()).data
      expect([meta.width, meta.height]).toEqual([37, 81])
      expect(meta.capture.description).toBe('tablet (768×1024), section #pricing, after 300 ms')
      expect((await (await fetch(`${server.url}/api/elements`)).json()).data.elements[0].name).toBe('at 37')
      expect((await (await fetch(`${server.url}/api/annotations`)).json()).data.annotations).toEqual([])
      const image = Buffer.from(await (await fetch(`${server.url}/api/image`)).arrayBuffer())
      expect(image.equals(makeFixturePng(37, 81))).toBe(true)
    })

    it('names the capture in the feedback', async () => {
      await start({ captureSettings: desktop, recapture: vi.fn().mockResolvedValue(fakeCapture(37, 81)) })
      await post('/api/recapture', { viewport: 'mobile' })
      await post('/api/annotations', { annotations: [pin] })
      await post('/api/feedback', {})
      expect((await server.waitForDecision()).output).toContain('Captured at mobile (375×812), full page\n')
    })

    it('rejects invalid settings without capturing', async () => {
      const recapture = vi.fn()
      await start({ captureSettings: desktop, recapture })
      const res = await post('/api/recapture', { viewport: '10x10' })
      expect(res.status).toBe(400)
      expect(recapture).not.toHaveBeenCalled()
    })

    it('refuses a second recapture while one is running', async () => {
      let finish
      const recapture = vi.fn().mockReturnValue(new Promise((resolve) => { finish = resolve }))
      await start({ captureSettings: desktop, recapture })
      const first = post('/api/recapture', { viewport: 'mobile' })
      await vi.waitFor(() => expect(recapture).toHaveBeenCalled())
      expect((await post('/api/recapture', { viewport: 'tablet' })).status).toBe(409)
      finish(fakeCapture(37, 81))
      expect((await first).status).toBe(200)
    })

    it('keeps the current capture and annotations when the capture fails', async () => {
      await start({ captureSettings: desktop, recapture: vi.fn().mockRejectedValue(new Error('Anchor #x not found on the page')) })
      await post('/api/annotations', { annotations: [pin] })
      const res = await post('/api/recapture', { viewport: 'mobile', section: { anchor: '#x' } })
      expect(res.status).toBe(502)
      expect((await res.json()).error).toMatch(/#x not found/)
      expect((await (await fetch(`${server.url}/api/meta`)).json()).data.width).toBe(40)
      expect((await (await fetch(`${server.url}/api/annotations`)).json()).data.annotations).toEqual([pin])
    })

    it('is not offered for a local image', async () => {
      await start()
      expect((await post('/api/recapture', { viewport: 'mobile' })).status).toBe(404)
    })
  })

  it('names the matched page element in feedback and approve-with-notes, and keeps the map off /api/meta', async () => {
    const domMap = [{ tag: 'a', role: 'button', name: 'Start trial', media: '', selector: 'a.cta', box: { x: 0, y: 0, width: 20, height: 20 } }]
    const annotations = [{ id: 'a1', type: 'pin', geometry: { x: 5, y: 5 }, text: 'hi', color: '#e11d48' }]
    for (const route of ['/api/feedback', '/api/approve']) {
      await start({ domMap })
      const meta = await (await fetch(`${server.url}/api/meta`)).json()
      expect(meta.data).not.toHaveProperty('domMap')
      await fetch(`${server.url}/api/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations })
      })
      await fetch(`${server.url}${route}`, { method: 'POST' })
      const decision = await server.waitForDecision()
      expect(decision.output).toContain('Element: a[button] "Start trial" · a.cta')
      server.stop()
      server = null
    }
  })

  it('returns 500 and leaves the decision unresolved when /api/approve fails to flatten the image', async () => {
    await start()
    await fetch(`${server.url}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: [{ id: 'a1', type: 'pin', geometry: { x: 5, y: 5 }, text: 'hi', color: '#e11d48' }] })
    })
    flattenAnnotations.mockRejectedValueOnce(new Error('canvas decode boom'))

    const res = await fetch(`${server.url}/api/approve`, { method: 'POST' })
    expect(res.status).toBe(500)
    expect(await isStillPending(server)).toBe(true)
  })

  it('returns 500 and leaves the decision unresolved when /api/feedback fails to write the annotated image', async () => {
    await start()
    await fetch(`${server.url}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: [{ id: 'a1', type: 'box', geometry: { x: 0, y: 0, width: 10, height: 10 }, text: 'fix', color: '#e11d48' }] })
    })
    writeAnnotatedImage.mockRejectedValueOnce(new Error('disk full'))

    const res = await fetch(`${server.url}/api/feedback`, { method: 'POST' })
    expect(res.status).toBe(500)
    expect(await isStillPending(server)).toBe(true)
  })

  it('rejects a POST /api/annotations payload carrying more than 10000 annotations', async () => {
    await start()
    const annotations = Array.from({ length: 10001 }, (_, i) => ({ id: `a${i}`, type: 'pin', geometry: { x: 1, y: 1 } }))
    const res = await fetch(`${server.url}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations })
    })
    expect(res.status).toBe(400)
  })

  it('rejects a POST /api/annotations payload whose geometry.points exceeds the per-annotation limit - this endpoint is reachable directly, bypassing the client\'s own import validator', async () => {
    await start()
    const points = Array.from({ length: 5001 }, (_, i) => ({ x: i, y: i }))
    const res = await fetch(`${server.url}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: [{ id: 'a1', type: 'freehand', geometry: { points } }] })
    })
    expect(res.status).toBe(400)
  })

  it('rejects a POST /api/annotations payload whose geometry.points holds a missing or non-numeric point', async () => {
    await start()
    for (const points of [[null], [{ x: 1 }], [{ x: '1', y: 2 }], [{ x: 1, y: Number.MAX_VALUE * 2 }]]) {
      const res = await fetch(`${server.url}/api/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: [{ id: 'a1', type: 'freehand', geometry: { points } }] })
      })
      expect(res.status).toBe(400)
    }
  })

  it('accepts a POST /api/annotations payload within both limits', async () => {
    await start()
    const points = Array.from({ length: 5000 }, (_, i) => ({ x: i, y: i }))
    const res = await fetch(`${server.url}/api/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: [{ id: 'a1', type: 'freehand', geometry: { points } }] })
    })
    expect(res.status).toBe(200)
  })
})
