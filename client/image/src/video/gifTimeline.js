import { GifReader } from 'omggif'

export const MAX_GIF_FRAMES = 2000
// Browsers play a delay below 2 centiseconds as 10, so a GIF saved with
// delay 0 still runs at the speed its author saw.
const MIN_DELAY_CS = 2
const FALLBACK_DELAY_CS = 10
// Upper bound for the composited checkpoints kept for seeking. Keeping every
// frame would cost about 1 GB for a 300-frame 720p GIF.
const CHECKPOINT_BUDGET_BYTES = 256 * 1024 * 1024

const DISPOSE_TO_BACKGROUND = 2
const DISPOSE_TO_PREVIOUS = 3

// A frame rect may reach past the logical screen; unclipped, its overflow
// would wrap into the next row.
function clearRect(pixels, canvasWidth, canvasHeight, { x, y, width, height }) {
  const right = Math.min(canvasWidth, x + width)
  for (let row = y; row < Math.min(canvasHeight, y + height); row++) {
    pixels.fill(0, (row * canvasWidth + x) * 4, (row * canvasWidth + right) * 4)
  }
}

/**
 * Decode a GIF into a seekable timeline. A GIF frame is usually a patch on
 * top of the previous picture, so showing frame n means compositing every
 * frame before it; checkpoints every few frames keep a seek cheap.
 */
export function createGifTimeline(arrayBuffer) {
  let reader
  try {
    reader = new GifReader(new Uint8Array(arrayBuffer))
  } catch (error) {
    throw new Error(`Could not decode the GIF: ${error.message}`)
  }

  const frameCount = reader.numFrames()
  if (frameCount === 0) { throw new Error('The GIF has no frames') }
  if (frameCount > MAX_GIF_FRAMES) {
    throw new Error(`The GIF has ${frameCount} frames (max ${MAX_GIF_FRAMES}). Convert it to MP4 first.`)
  }

  const { width, height } = reader
  const infos = Array.from({ length: frameCount }, (_, i) => reader.frameInfo(i))
  const delays = infos.map((info) => (info.delay < MIN_DELAY_CS ? FALLBACK_DELAY_CS : info.delay) / 100)
  let elapsed = 0
  const starts = delays.map((delay) => {
    const start = Math.round(elapsed * 1000) / 1000
    elapsed += delay
    return start
  })
  const duration = starts[frameCount - 1] + delays[frameCount - 1]

  const frameBytes = width * height * 4
  // A checkpoint also keeps the picture to restore for a frame disposed to previous.
  const checkpointBytes = infos.some((info) => info.disposal === DISPOSE_TO_PREVIOUS) ? frameBytes * 2 : frameBytes
  const maxCheckpoints = Math.max(1, Math.floor(CHECKPOINT_BUDGET_BYTES / checkpointBytes))
  const checkpointEvery = Math.max(1, Math.ceil(frameCount / maxCheckpoints))
  const checkpoints = new Map()

  // The compositing cursor: the picture after frame `index` has been drawn,
  // plus the picture to restore when that frame is disposed to previous.
  let cursor = { index: -1, pixels: new Uint8ClampedArray(frameBytes), saved: null }

  function advance() {
    const { index, pixels } = cursor
    if (index >= 0) {
      const disposal = infos[index].disposal
      if (disposal === DISPOSE_TO_BACKGROUND) { clearRect(pixels, width, height, infos[index]) }
      if (disposal === DISPOSE_TO_PREVIOUS && cursor.saved) { pixels.set(cursor.saved) }
    }
    const next = index + 1
    const saved = infos[next].disposal === DISPOSE_TO_PREVIOUS ? pixels.slice() : null
    reader.decodeAndBlitFrameRGBA(next, pixels)
    cursor = { index: next, pixels, saved }
    if (next % checkpointEvery === 0 && !checkpoints.has(next)) {
      checkpoints.set(next, { index: next, pixels: pixels.slice(), saved: saved?.slice() ?? null })
    }
  }

  function restore(checkpoint) {
    cursor = checkpoint
      ? { index: checkpoint.index, pixels: checkpoint.pixels.slice(), saved: checkpoint.saved?.slice() ?? null }
      : { index: -1, pixels: new Uint8ClampedArray(frameBytes), saved: null }
  }

  /** The composited RGBA pixels of frame `target`. The array is reused, so copy it before the next call. */
  function renderFrame(target) {
    const clamped = Math.min(frameCount - 1, Math.max(0, target))
    const checkpoint = checkpoints.get(Math.floor(clamped / checkpointEvery) * checkpointEvery)
    // Every checkpoint below the furthest frame composited so far exists, so
    // going backwards always finds one; going forwards it only helps when it
    // lies ahead of the cursor.
    if (clamped < cursor.index || (checkpoint && checkpoint.index > cursor.index)) {
      restore(checkpoint)
    }
    while (cursor.index < clamped) { advance() }
    return cursor.pixels
  }

  function frameIndexAt(time) {
    let low = 0
    let high = frameCount - 1
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      if (starts[mid] <= time) { low = mid } else { high = mid - 1 }
    }
    return low
  }

  return { width, height, frameCount, starts, delays, duration, frameIndexAt, renderFrame }
}
