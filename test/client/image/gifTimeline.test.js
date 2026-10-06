import { describe, it, expect } from 'vitest'
import { GifWriter } from 'omggif'
import { createGifTimeline, MAX_GIF_FRAMES } from '../../../client/image/src/video/gifTimeline.js'

const RED = 0
const GREEN = 1
const BLUE = 2
const CLEAR = 3
const PALETTE = [0xff0000, 0x00ff00, 0x0000ff, 0x000000]

/**
 * Build a 4x4 GIF in memory. Each frame is { color, delay, disposal, rect }
 * where rect defaults to the whole canvas.
 */
function makeGif(frames) {
  const buffer = new Uint8Array(4096)
  const writer = new GifWriter(buffer, 4, 4, { palette: PALETTE, loop: 0 })
  for (const { color, delay = 10, disposal = 0, rect = [0, 0, 4, 4] } of frames) {
    const [x, y, w, h] = rect
    writer.addFrame(x, y, w, h, new Array(w * h).fill(color), { delay, disposal, transparent: CLEAR })
  }
  return buffer.slice(0, writer.end()).buffer
}

function pixelAt(pixels, x, y) {
  const i = (y * 4 + x) * 4
  return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]
}

describe('createGifTimeline', () => {
  it('derives frame start times and duration from the delays', () => {
    const timeline = createGifTimeline(makeGif([{ color: RED, delay: 10 }, { color: GREEN, delay: 20 }, { color: BLUE, delay: 30 }]))
    expect(timeline.width).toBe(4)
    expect(timeline.frameCount).toBe(3)
    expect(timeline.starts).toEqual([0, 0.1, 0.3])
    expect(timeline.duration).toBeCloseTo(0.6)
  })

  it('treats a near-zero delay the way browsers do, as 100 ms', () => {
    const timeline = createGifTimeline(makeGif([{ color: RED, delay: 0 }, { color: GREEN, delay: 1 }]))
    expect(timeline.starts).toEqual([0, 0.1])
  })

  it('finds the frame shown at a given time', () => {
    const timeline = createGifTimeline(makeGif([{ color: RED }, { color: GREEN }, { color: BLUE }]))
    expect(timeline.frameIndexAt(0)).toBe(0)
    expect(timeline.frameIndexAt(0.15)).toBe(1)
    expect(timeline.frameIndexAt(99)).toBe(2)
    expect(timeline.frameIndexAt(-1)).toBe(0)
  })

  it('renders frames in any order, including backwards', () => {
    const timeline = createGifTimeline(makeGif([{ color: RED }, { color: GREEN }, { color: BLUE }]))
    expect(pixelAt(timeline.renderFrame(2), 0, 0)).toEqual([0, 0, 255, 255])
    expect(pixelAt(timeline.renderFrame(0), 0, 0)).toEqual([255, 0, 0, 255])
    expect(pixelAt(timeline.renderFrame(1), 3, 3)).toEqual([0, 255, 0, 255])
  })

  it('keeps earlier pixels where a partial frame does not draw', () => {
    const timeline = createGifTimeline(makeGif([{ color: RED }, { color: GREEN, rect: [0, 0, 2, 2] }]))
    const pixels = timeline.renderFrame(1)
    expect(pixelAt(pixels, 0, 0)).toEqual([0, 255, 0, 255])
    expect(pixelAt(pixels, 3, 3)).toEqual([255, 0, 0, 255])
  })

  it('clears a frame disposed to background before the next one', () => {
    const timeline = createGifTimeline(makeGif([
      { color: RED, disposal: 2 },
      { color: GREEN, rect: [0, 0, 1, 1] }
    ]))
    const pixels = timeline.renderFrame(1)
    expect(pixelAt(pixels, 0, 0)).toEqual([0, 255, 0, 255])
    expect(pixelAt(pixels, 3, 3)[3]).toBe(0)
  })

  it('restores the previous picture for a frame disposed to previous', () => {
    const timeline = createGifTimeline(makeGif([
      { color: RED },
      { color: GREEN, disposal: 3 },
      { color: BLUE, rect: [0, 0, 1, 1] }
    ]))
    const pixels = timeline.renderFrame(2)
    expect(pixelAt(pixels, 0, 0)).toEqual([0, 0, 255, 255])
    expect(pixelAt(pixels, 3, 3)).toEqual([255, 0, 0, 255])
  })

  it('rejects data that is not a GIF', () => {
    expect(() => createGifTimeline(new Uint8Array([1, 2, 3]).buffer)).toThrow(/GIF/)
  })

  it('exposes a frame cap', () => {
    expect(MAX_GIF_FRAMES).toBe(2000)
  })
})
