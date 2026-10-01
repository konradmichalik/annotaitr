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
    expect(body.data).toEqual({ width: 40, height: 30, origin: 'cli', targetLabel: null, voiceNotes: false })
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
