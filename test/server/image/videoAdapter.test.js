import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { buildVideoServer } from '../../../server/image/videoAdapter.js'
import { makeFixturePng } from '../../helpers/fixtureImage.js'

const WIDTH = 40
const HEIGHT = 30
const DURATION = 12

const box = (id, time, extra = {}) => ({
  id, type: 'box', geometry: { x: 2, y: 2, width: 10, height: 10 }, text: `note ${id}`, color: '#bf616a', time, ...extra
})

describe('video annotator server', () => {
  let dir
  let videoPath
  let server

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-video-server-'))
    videoPath = join(dir, 'clip.webm')
    await writeFile(videoPath, Buffer.alloc(4096, 7))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  afterEach(() => {
    server?.stop()
    server = null
  })

  async function start() {
    server = await buildVideoServer({
      video: { path: videoPath, kind: 'video', mimeType: 'video/webm' },
      origin: 'cli',
      targetLabel: 'clip.webm'
    })
    return server
  }

  const post = (path, body) => fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const putFrame = (time, buffer = makeFixturePng(WIDTH, HEIGHT)) => fetch(`${server.url}/api/frames?t=${time}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: buffer
  })

  async function planWith(annotations) {
    await post('/api/annotations', { annotations })
    const res = await post('/api/frame-plan', { duration: DURATION, width: WIDTH, height: HEIGHT })
    return { res, times: res.ok ? (await res.json()).data.times : [] }
  }

  async function uploadAll(times) {
    for (const time of times) {
      const res = await putFrame(time)
      expect(res.status).toBe(200)
    }
  }

  it('serves video metadata', async () => {
    await start()
    const body = await (await fetch(`${server.url}/api/meta`)).json()
    expect(body.data).toEqual({ kind: 'video', mediaKind: 'video', mimeType: 'video/webm', origin: 'cli', targetLabel: 'clip.webm', voiceNotes: false })
  })

  it('streams the file with range support', async () => {
    await start()
    const res = await fetch(`${server.url}/api/media`, { headers: { Range: 'bytes=0-99' } })
    expect(res.status).toBe(206)
    expect(res.headers.get('content-type')).toBe('video/webm')
    expect((await res.arrayBuffer()).byteLength).toBe(100)
  })

  it('rejects annotations without a valid time', async () => {
    await start()
    const res = await post('/api/annotations', { annotations: [box('a', -1)] })
    expect(res.status).toBe(400)
  })

  it('plans one frame per annotation time plus the overview', async () => {
    await start()
    const { times } = await planWith([box('a', 1), box('b', 1)])
    expect(times).toContain(1)
    expect(times).toHaveLength(13)
  })

  it('rejects a plan over the frame limit', async () => {
    await start()
    const annotations = Array.from({ length: 50 }, (_, i) => box(`a${i}`, i * 0.2))
    const { res } = await planWith(annotations)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/frames/)
  })

  it('rejects a frame size beyond the video cap, which would decode to gigabytes', async () => {
    await start()
    await post('/api/annotations', { annotations: [box('a', 1)] })
    const res = await post('/api/frame-plan', { duration: DURATION, width: 9000, height: HEIGHT })
    expect(res.status).toBe(400)
  })

  it('rejects an annotation ending after the recording', async () => {
    await start()
    const { res } = await planWith([box('a', 1, { endTime: DURATION + 5 })])
    expect(res.status).toBe(400)
  })

  it('rejects a frame that is not in the plan, is not a PNG or has the wrong size', async () => {
    await start()
    await planWith([box('a', 1)])
    expect((await putFrame(2)).status).toBe(400)
    expect((await putFrame(1, Buffer.from('not a png'))).status).toBe(400)
    expect((await putFrame(1, makeFixturePng(WIDTH + 1, HEIGHT))).status).toBe(400)
  })

  it('refuses feedback while frames are missing', async () => {
    await start()
    await planWith([box('a', 1)])
    await putFrame(1)
    const res = await post('/api/feedback', {})
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/missing/i)
  })

  it('refuses feedback when the annotations changed after planning', async () => {
    await start()
    const { times } = await planWith([box('a', 1)])
    await uploadAll(times)
    await post('/api/annotations', { annotations: [box('a', 2)] })
    const res = await post('/api/feedback', {})
    expect(res.status).toBe(409)
  })

  it('writes frames, strip and overview and resolves with feedback pointing at them', async () => {
    await start()
    const { times } = await planWith([box('a', 1), box('b', 3, { endTime: 5 }), { id: 'g', type: 'comment', geometry: null, text: 'overall' }])
    await uploadAll(times)
    const res = await post('/api/feedback', {})
    expect(res.status).toBe(200)

    const decision = await server.waitForDecision()
    expect(decision.approved).toBe(false)
    expect(decision.annotationCount).toBe(3)
    expect(decision.output).toContain('3 annotations on the recording clip.webm (00:12.000, 40x30).')

    const overview = decision.output.match(/Overview: (\S+)/)[1]
    const frames = [...decision.output.matchAll(/Frame: (\S+)/g)].map((m) => m[1])
    const strip = decision.output.match(/Strip: (\S+)/)[1]
    for (const file of [overview, ...frames, strip]) { expect(existsSync(file)).toBe(true) }
    expect(frames[0]).toMatch(/frame-01-00m01\.000s\.png$/)
    expect(strip).toMatch(/strip-02-00m03\.000s-00m05\.000s\.png$/)
    expect((await readdir(dirname(overview))).sort()).toEqual([
      'frame-01-00m01.000s.png', 'frame-02-00m03.000s.png', 'overview.png', 'strip-02-00m03.000s-00m05.000s.png'
    ])
  })

  it('approves with notes the same way', async () => {
    await start()
    const { times } = await planWith([box('a', 1)])
    await uploadAll(times)
    await post('/api/approve', {})
    const decision = await server.waitForDecision()
    expect(decision.approved).toBe(true)
    expect(decision.output).toMatch(/^APPROVED WITH NOTES: 1 note\./)
  })

  it('refuses a new frame plan and a second decision once a decision was made', async () => {
    await start()
    const { times } = await planWith([box('a', 1)])
    await uploadAll(times)
    expect((await post('/api/feedback', {})).status).toBe(200)
    expect((await post('/api/feedback', {})).status).toBe(409)
    expect((await post('/api/frame-plan', { duration: DURATION, width: WIDTH, height: HEIGHT })).status).toBe(409)
    expect((await putFrame(times[0])).status).toBe(409)
  })

  it('puts a span drawing on every frame it covers, as the annotator shows it', async () => {
    await start()
    const { times } = await planWith([box('s', 1, { endTime: 3 }), box('p', 2)])
    await uploadAll(times)
    await post('/api/feedback', {})
    const { output } = await server.waitForDecision()
    expect(output).toContain('### 2. at 00:02.000, Boxed area')
    expect(output).toMatch(/close to annotation 1/)
  })

  it('removes the uploaded raw frames when the server stops without a decision', async () => {
    await start()
    const { times } = await planWith([box('a', 1)])
    await uploadAll(times)
    const rawDirs = (await readdir(tmpdir())).filter((name) => name.startsWith('annotaitr-frames-'))
    server.stop()
    server = null
    const remaining = (await readdir(tmpdir())).filter((name) => name.startsWith('annotaitr-frames-'))
    expect(remaining.length).toBe(rawDirs.length - 1)
  })

  it('approves without annotations and without any frames', async () => {
    await start()
    await post('/api/approve', {})
    const decision = await server.waitForDecision()
    expect(decision.output).toBe('APPROVED: No changes requested.\n')
  })
})
