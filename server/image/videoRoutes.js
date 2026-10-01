import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express, { Router } from 'express'
import { annotationsWithinLimits, MAX_ANNOTATIONS, MAX_POINTS_PER_ANNOTATION } from './routes.js'
import { formatApprovalOutput } from './feedback.js'
import { exportVideoFeedback, formatVideoApprovalWithNotes } from './videoFeedback.js'
import { orderVideoAnnotations, planFrames, validateVideoAnnotations, MAX_FRAMES } from './timeline.js'
import { writeVideoOutput } from './videoOutput.js'
import { config } from './config.js'

function success(data) { return { success: true, data } }
function failure(error) { return { success: false, error } }

// A 4K PNG frame stays well below this, and nothing else uses the raw parser.
const FRAME_UPLOAD_LIMIT = '40mb'
// A browser reports duration and currentTime with slight rounding, so an
// annotation on the very last frame can land a hair past `duration`.
const DURATION_TOLERANCE = 0.5
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Width and height from a PNG's IHDR chunk, or null when the buffer is not a PNG. */
function pngSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) { return null }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE) || buffer.toString('ascii', 12, 16) !== 'IHDR') { return null }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isValidDimension(value) {
  return Number.isInteger(value) && value > 0 && value <= config.maxVideoDimension
}

function validateMedia(body) {
  const { duration, width, height } = body ?? {}
  if (!isPositiveNumber(duration) || !isValidDimension(width) || !isValidDimension(height)) {
    return 'duration must be a positive number, width and height positive integers'
  }
  return null
}

function sameTimes(a, b) {
  return a.length === b.length && a.every((time, i) => time === b[i])
}

/**
 * The video variant of image mode's API. The browser plays the file and
 * grabs frames itself; the server streams the file, tells the browser which
 * frames it needs (POST /api/frame-plan), stores them (PUT /api/frames) and
 * renders the output once a decision arrives.
 */
export function createVideoApiRouter({ video, origin, targetLabel, state, resolveDecision }) {
  const router = Router()

  router.get('/api/meta', (_req, res) => {
    res.json(success({ kind: 'video', mediaKind: video.kind, mimeType: video.mimeType, origin, targetLabel }))
  })

  router.get('/api/media', (_req, res) => {
    res.sendFile(video.path, { dotfiles: 'allow', headers: { 'Content-Type': video.mimeType } })
  })

  router.get('/api/annotations', (_req, res) => {
    res.json(success({ annotations: state.annotations }))
  })

  router.post('/api/annotations', (req, res) => {
    const { annotations } = req.body
    if (!Array.isArray(annotations)) {
      return res.status(400).json(failure('annotations must be an array'))
    }
    if (!annotationsWithinLimits(annotations)) {
      return res.status(400).json(failure(
        `Too many annotations or points (max ${MAX_ANNOTATIONS} annotations, ${MAX_POINTS_PER_ANNOTATION} points each)`
      ))
    }
    const timeError = validateVideoAnnotations(annotations)
    if (timeError) { return res.status(400).json(failure(timeError)) }
    state.annotations = [...annotations]
    res.json(success({ saved: true, count: annotations.length }))
  })

  // Once a decision starts rendering, the frames on disk belong to it, so
  // nothing may plan, replace or delete them any more.
  const rejectWhileDeciding = (_req, res, next) => {
    if (state.deciding || state.decided) { return res.status(409).json(failure('A decision is already being submitted')) }
    next()
  }

  router.post('/api/frame-plan', rejectWhileDeciding, async (req, res) => {
    // Set before the first await, so a second plan cannot interleave and
    // leave a temp directory behind.
    if (state.planning) { return res.status(409).json(failure('A frame plan is already being prepared')) }
    const mediaError = validateMedia(req.body)
    if (mediaError) { return res.status(400).json(failure(mediaError)) }
    const { duration, width, height } = req.body
    const tooLate = state.annotations.find((a) => (a.endTime ?? a.time ?? 0) > duration + DURATION_TOLERANCE)
    if (tooLate) { return res.status(400).json(failure('An annotation lies beyond the end of the recording')) }

    const moments = new Set(state.annotations.filter((a) => typeof a.time === 'number').map((a) => a.time)).size
    const plan = moments > MAX_FRAMES ? null : planFrames(orderVideoAnnotations(state.annotations), duration)
    if (!plan || plan.times.length > MAX_FRAMES) {
      return res.status(400).json(failure(
        `Too many frames to export (${plan?.times.length ?? `${moments}+`}, max ${MAX_FRAMES}). Merge annotations onto fewer moments or shorten spans.`
      ))
    }

    // Express 4 does not catch a rejected async handler, and an unhandled
    // rejection ends the CLI without printing a decision.
    state.planning = true
    try {
      if (state.rawDir) { await rm(state.rawDir, { recursive: true, force: true }) }
      state.rawDir = await mkdtemp(join(tmpdir(), 'annotaitr-frames-'))
      state.media = { duration, width, height }
      state.planTimes = plan.times
      state.rawFrames = new Map()
      res.json(success({ times: plan.times }))
    } catch (error) {
      console.error(error)
      res.status(500).json(failure(error.message))
    } finally {
      state.planning = false
    }
  })

  router.put('/api/frames', rejectWhileDeciding, express.raw({ type: 'image/png', limit: FRAME_UPLOAD_LIMIT }), async (req, res) => {
    if (!state.planTimes) { return res.status(400).json(failure('Request a frame plan first')) }
    const time = state.planTimes.find((t) => t === Number(req.query.t))
    if (time === undefined) { return res.status(400).json(failure('This frame is not part of the plan')) }
    const size = pngSize(req.body)
    if (!size) { return res.status(400).json(failure('A frame must be a PNG')) }
    if (size.width !== state.media.width || size.height !== state.media.height) {
      return res.status(400).json(failure(`Frame is ${size.width}x${size.height}, expected ${state.media.width}x${state.media.height}`))
    }
    const path = join(state.rawDir, `${state.planTimes.indexOf(time)}.png`)
    try {
      await writeFile(path, req.body)
      state.rawFrames.set(time, path)
      res.json(success({ saved: true }))
    } catch (error) {
      console.error(error)
      res.status(500).json(failure(error.message))
    }
  })

  function readyPlan() {
    if (!state.planTimes) { return { status: 400, error: 'Request a frame plan first' } }
    const ordered = orderVideoAnnotations(state.annotations)
    const plan = planFrames(ordered, state.media.duration)
    if (!sameTimes(plan.times, state.planTimes)) {
      return { status: 409, error: 'Annotations changed since the frame plan, request a new one' }
    }
    const missing = plan.times.filter((t) => !state.rawFrames.has(t)).length
    if (missing > 0) { return { status: 400, error: `${missing} planned frame(s) missing` } }
    return { ordered, plan }
  }

  async function decide(res, { approved }) {
    const ready = readyPlan()
    if (ready.error) { return res.status(ready.status).json(failure(ready.error)) }
    state.deciding = true
    try {
      const files = await writeVideoOutput(ready.plan, state.rawFrames)
      const context = { ordered: ready.ordered, plan: ready.plan, files, media: { label: targetLabel, ...state.media } }
      const output = approved ? formatVideoApprovalWithNotes(context) : exportVideoFeedback(context)
      await rm(state.rawDir, { recursive: true, force: true })
      state.rawDir = null
      state.decided = true
      res.json(success({ message: approved ? 'Approved with notes' : 'Feedback submitted' }))
      setTimeout(() => resolveDecision({ approved, output, annotationCount: ready.ordered.length }), 100)
    } catch (error) {
      console.error(error)
      res.status(500).json(failure(error.message))
    } finally {
      state.deciding = false
    }
  }

  router.post('/api/approve', rejectWhileDeciding, async (_req, res) => {
    if (state.annotations.length === 0) {
      res.json(success({ message: 'Approved' }))
      setTimeout(() => resolveDecision({ approved: true, output: formatApprovalOutput() }), 100)
      return
    }
    await decide(res, { approved: true })
  })

  router.post('/api/feedback', rejectWhileDeciding, async (_req, res) => {
    if (state.annotations.length === 0) {
      return res.status(400).json(failure('No annotations to submit: use Approve instead'))
    }
    await decide(res, { approved: false })
  })

  return router
}
