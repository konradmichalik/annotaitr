import { createGifTimeline } from './gifTimeline.js'

/**
 * Players for a video (<video>) and a GIF (decoded onto a <canvas>) behind
 * one interface, so the timeline, the shortcuts and the frame export never
 * need to know which one they drive:
 *
 *   element, width, height, duration
 *   getState() -> { currentTime, playing, rate, frameDuration, hasAudio, muted, volume }
 *   subscribe(listener) -> unsubscribe
 *   play(), pause(), togglePlay(), setRate(rate), setMuted(muted), setVolume(volume)
 *   seek(time), step(frames)           both pause first: a jump lands on a frame to look at or draw on
 *   snap(time) -> time                 the time to store for the frame shown at `time`
 *   grabFrame(time) -> Promise<Blob>   a PNG of that frame, without moving the visible player
 *   destroy()
 */

const FALLBACK_FRAME_DURATION = 1 / 30
const SEEK_TIMEOUT_MS = 5000

const CONVERT_HINT = 'Convert it with: ffmpeg -i input.mov -c:v libx264 -pix_fmt yuv420p output.mp4'

function describeMediaError(error) {
  // MEDIA_ERR_SRC_NOT_SUPPORTED: typically HEVC in a .mov, which only some browsers decode.
  if (error?.code === 4) { return `This browser cannot play this video format. ${CONVERT_HINT}` }
  if (error?.code === 3) { return `The video could not be decoded. ${CONVERT_HINT}` }
  return `The video could not be loaded${error?.message ? `: ${error.message}` : '.'}`
}

function createEmitter() {
  const listeners = new Set()
  return {
    emit: (state) => listeners.forEach((listener) => listener(state)),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the frame'))), 'image/png')
  })
}

function waitForEvent(target, event, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      target.removeEventListener(event, onEvent)
      reject(new Error(timeoutMessage))
    }, timeoutMs)
    function onEvent() {
      clearTimeout(timer)
      resolve()
    }
    target.addEventListener(event, onEvent, { once: true })
  })
}

function createVideoElement(src) {
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = src
  return video
}

function loadMetadata(video) {
  return new Promise((resolve, reject) => {
    const onLoaded = () => {
      video.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      reject(new Error(describeMediaError(video.error)))
    }
    video.addEventListener('loadedmetadata', onLoaded, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

/**
 * A WebM written by MediaRecorder carries no duration, so the browser
 * reports Infinity until it has seen the end. Seeking far past it makes the
 * browser find the real end.
 */
async function resolveDuration(video) {
  if (Number.isFinite(video.duration)) { return }
  const found = waitForEvent(video, 'durationchange', SEEK_TIMEOUT_MS, 'Could not determine the video duration')
  video.currentTime = Number.MAX_SAFE_INTEGER
  await found
  video.currentTime = 0
}

async function seekElement(video, time) {
  if (Math.abs(video.currentTime - time) < 1e-6 && !video.seeking) { return }
  const seeked = waitForEvent(video, 'seeked', SEEK_TIMEOUT_MS, `Seeking to ${time.toFixed(3)}s timed out`)
  video.currentTime = time
  await seeked
}

const isPlausibleFrameDuration = (value) => value > 1 / 240 && value < 1 / 5

/**
 * Neither the element nor the container reports a frame rate, but frame
 * stepping needs one from the first key press. Playing a few frames muted
 * and reading their media times gives it; the element is not on screen yet.
 */
async function measureFrameDuration(video) {
  if (!('requestVideoFrameCallback' in video)) { return FALLBACK_FRAME_DURATION }
  const frames = []
  const measured = new Promise((resolve) => {
    const onFrame = (_now, metadata) => {
      frames.push(metadata)
      if (frames.length < 4) { video.requestVideoFrameCallback(onFrame) } else { resolve() }
    }
    video.requestVideoFrameCallback(onFrame)
  })
  try {
    await video.play()
    await Promise.race([measured, new Promise((resolve) => setTimeout(resolve, 1000))])
  } catch {
    return FALLBACK_FRAME_DURATION
  } finally {
    video.pause()
  }
  await seekElement(video, 0)
  if (frames.length < 2) { return FALLBACK_FRAME_DURATION }
  const first = frames[0]
  const last = frames.at(-1)
  const value = (last.mediaTime - first.mediaTime) / Math.max(1, last.presentedFrames - first.presentedFrames)
  return isPlausibleFrameDuration(value) ? value : FALLBACK_FRAME_DURATION
}

function releaseElement(video) {
  video.pause()
  video.removeAttribute('src')
  video.load()
}

export async function loadVideoController(src) {
  const video = createVideoElement(src)
  try {
    await loadMetadata(video)
    await resolveDuration(video)
    const frameDuration = await measureFrameDuration(video)
    return createVideoController(video, src, frameDuration)
  } catch (error) {
    releaseElement(video)
    throw error
  }
}

function createVideoController(video, src, initialFrameDuration) {
  const { emit, subscribe } = createEmitter()
  const width = video.videoWidth
  const height = video.videoHeight
  const duration = video.duration
  let frameDuration = initialFrameDuration
  let rafId = null
  let frameCallbackId = null
  let lastFrame = null
  let grabber = null

  const getState = () => ({
    currentTime: video.currentTime,
    playing: !video.paused,
    rate: video.playbackRate,
    frameDuration,
    hasAudio: true,
    muted: video.muted,
    volume: video.volume
  })
  const notify = () => emit(getState())

  // Measure the real frame rate while playing: the media time between two
  // presented frames, divided by how many frames that covered.
  function trackFrames(_now, metadata) {
    if (lastFrame && metadata.presentedFrames > lastFrame.presentedFrames) {
      const measured = (metadata.mediaTime - lastFrame.mediaTime) / (metadata.presentedFrames - lastFrame.presentedFrames)
      if (isPlausibleFrameDuration(measured)) { frameDuration = measured }
    }
    lastFrame = metadata
    frameCallbackId = video.requestVideoFrameCallback(trackFrames)
  }

  function tick() {
    notify()
    rafId = requestAnimationFrame(tick)
  }

  function onPlay() {
    if (rafId === null) { rafId = requestAnimationFrame(tick) }
    if ('requestVideoFrameCallback' in video && frameCallbackId === null) {
      lastFrame = null
      frameCallbackId = video.requestVideoFrameCallback(trackFrames)
    }
    notify()
  }

  function onStop() {
    if (rafId !== null) { cancelAnimationFrame(rafId) }
    rafId = null
    if (frameCallbackId !== null) { video.cancelVideoFrameCallback(frameCallbackId) }
    frameCallbackId = null
    notify()
  }

  const events = { play: onPlay, pause: onStop, ended: onStop, seeked: notify, ratechange: notify, volumechange: notify }
  Object.entries(events).forEach(([event, handler]) => video.addEventListener(event, handler))

  async function grabFrame(time) {
    if (!grabber) {
      grabber = createVideoElement(src)
      await loadMetadata(grabber)
    }
    await seekElement(grabber, time)
    if (grabber.readyState < 2) {
      await waitForEvent(grabber, 'loadeddata', SEEK_TIMEOUT_MS, `Frame at ${time.toFixed(3)}s did not load`)
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(grabber, 0, 0, width, height)
    return canvasToPng(canvas)
  }

  return {
    element: video,
    width,
    height,
    duration,
    getState,
    subscribe,
    play: () => video.play().catch(() => {}),
    pause: () => video.pause(),
    togglePlay: () => (video.paused ? video.play().catch(() => {}) : video.pause()),
    seek(time) {
      video.pause()
      return seekElement(video, Math.min(duration, Math.max(0, time))).then(notify)
    },
    step(frames) {
      video.pause()
      return seekElement(video, Math.min(duration, Math.max(0, video.currentTime + frames * frameDuration))).then(notify)
    },
    setRate(rate) { video.playbackRate = rate },
    setMuted(muted) { video.muted = muted },
    // Turning the volume up from silence also unmutes, as in any player.
    setVolume(volume) {
      video.volume = volume
      if (volume > 0) { video.muted = false }
    },
    // Seeking a video to any time shows the frame covering it, and the
    // player then reports exactly that time, so no rounding is needed.
    snap: (time) => time,
    grabFrame,
    destroy() {
      onStop()
      Object.entries(events).forEach(([event, handler]) => video.removeEventListener(event, handler))
      releaseElement(video)
      if (grabber) { releaseElement(grabber) }
    }
  }
}

export async function loadGifController(src) {
  const response = await fetch(src)
  if (!response.ok) { throw new Error(`The GIF could not be loaded (${response.status})`) }
  return createGifController(createGifTimeline(await response.arrayBuffer()))
}

function createGifController(timeline) {
  const { emit, subscribe } = createEmitter()
  const { width, height, duration, starts, delays } = timeline
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(width, height)

  let frameIndex = -1
  let currentTime = 0
  let playing = false
  let rate = 1
  let rafId = null
  let lastTick = null

  const getState = () => ({
    currentTime, playing, rate, frameDuration: delays[Math.max(0, frameIndex)], hasAudio: false, muted: true, volume: 0
  })
  const notify = () => emit(getState())

  function draw(index) {
    if (index === frameIndex) { return }
    imageData.data.set(timeline.renderFrame(index))
    ctx.putImageData(imageData, 0, 0)
    frameIndex = index
  }

  // While paused the position sits on a frame's start, so an annotation's
  // time names exactly one frame and seeking back to it shows that frame.
  function snapToFrame(index) {
    draw(index)
    currentTime = starts[index]
  }

  function tick(now) {
    if (lastTick !== null) {
      // A GIF loops, so playback wraps around instead of stopping at the end.
      currentTime = (currentTime + ((now - lastTick) / 1000) * rate) % duration
      draw(timeline.frameIndexAt(currentTime))
    }
    lastTick = now
    notify()
    rafId = requestAnimationFrame(tick)
  }

  function play() {
    if (playing) { return }
    playing = true
    lastTick = null
    rafId = requestAnimationFrame(tick)
    notify()
  }

  function pause() {
    if (!playing) { return }
    playing = false
    cancelAnimationFrame(rafId)
    rafId = null
    snapToFrame(frameIndex)
    notify()
  }

  async function grabFrame(time) {
    const frameCanvas = document.createElement('canvas')
    frameCanvas.width = width
    frameCanvas.height = height
    const frameCtx = frameCanvas.getContext('2d')
    const frame = frameCtx.createImageData(width, height)
    frame.data.set(timeline.renderFrame(timeline.frameIndexAt(time)))
    frameCtx.putImageData(frame, 0, 0)
    return canvasToPng(frameCanvas)
  }

  snapToFrame(0)

  return {
    element: canvas,
    width,
    height,
    duration,
    getState,
    subscribe,
    play,
    pause,
    togglePlay: () => (playing ? pause() : play()),
    async seek(time) {
      pause()
      snapToFrame(timeline.frameIndexAt(Math.min(duration, Math.max(0, time))))
      notify()
    },
    async step(frames) {
      pause()
      snapToFrame(Math.min(starts.length - 1, Math.max(0, frameIndex + frames)))
      notify()
    },
    setRate(value) {
      rate = value
      notify()
    },
    setMuted() {},
    setVolume() {},
    snap: (time) => starts[timeline.frameIndexAt(time)],
    grabFrame,
    destroy() {
      if (rafId !== null) { cancelAnimationFrame(rafId) }
      playing = false
    }
  }
}
