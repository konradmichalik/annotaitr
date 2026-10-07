import { Router } from 'express'
import { success, failure } from '../../core/http.js'
import { annotationsFromBody } from '../common/annotationLimits.js'
import { flattenAnnotations } from '../common/render.js'
import { writeAnnotatedImage } from './output.js'
import { formatApprovalOutput, formatApprovalWithNotesOutput, exportFeedback } from '../common/feedback.js'
import { parseCaptureSettings, describeCapture, VIEWPORT_PRESETS } from '../common/config.js'

/**
 * Sniff the actual image format from its magic bytes. The captured/loaded
 * buffer can be PNG, JPEG, or WebP (a screenshot is always PNG, but a local
 * file or clipboard image is served through as-is) - always answering
 * `image/png` regardless mislabels a JPEG/WebP response, which a browser
 * with strict MIME sniffing disabled would refuse to render.
 */
function sniffImageType(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg'
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp'
  }
  return 'png'
}

// The presets travel with the meta so the client's viewport picker never
// needs its own copy of the sizes.
function captureMeta(settings) {
  return settings ? { ...settings, description: describeCapture(settings), presets: VIEWPORT_PRESETS } : null
}

/** Everything a decision needs from the capture as it is right now, which a recapture may have replaced. */
async function decisionInputs(state) {
  const { buffer, width, height, domMap, settings } = state.capture
  const annotatedImagePath = await writeAnnotatedImage(await flattenAnnotations(buffer, state.annotations))
  const note = settings ? describeCapture(settings) : null
  return { width, height, annotatedImagePath, domMap, note }
}

/**
 * Capture the URL again with new settings, in place: the open tab reloads
 * the new screenshot and map, the waiting CLI keeps waiting. Annotations
 * are discarded, since their coordinates belong to the old layout. Only a
 * URL target gets a `recapture` function.
 */
function mountRecapture(router, { state, recapture }) {
  let running = false
  router.post('/api/recapture', async (req, res) => {
    if (!recapture) { return res.status(404).json(failure('Only a captured URL can be captured again')) }
    if (running) { return res.status(409).json(failure('A capture is already running')) }
    const { settings, error } = parseCaptureSettings(req.body)
    if (error) { return res.status(400).json(failure(error)) }
    running = true
    try {
      const capture = await recapture(settings)
      state.capture = { ...capture, settings }
      state.annotations = []
      res.json(success({ width: capture.width, height: capture.height, capture: captureMeta(settings) }))
    } catch (captureError) {
      res.status(502).json(failure(captureError.message))
    } finally {
      running = false
    }
  })
}

/**
 * Render or describe the annotations the client sends, for copying and
 * saving from the annotator. They come with the request rather than from
 * state, which the client only saves after a pause, and nothing is decided.
 */
function mountExport(router, { state }) {
  router.post('/api/annotated-image', async (req, res) => {
    const { annotations, error } = annotationsFromBody(req.body)
    if (error) { return res.status(400).json(failure(error)) }
    try {
      res.type('png').send(await flattenAnnotations(state.capture.buffer, annotations))
    } catch (renderError) {
      res.status(500).json(failure(renderError.message))
    }
  })

  router.post('/api/feedback-text', (req, res) => {
    const { annotations, error } = annotationsFromBody(req.body)
    if (error) { return res.status(400).json(failure(error)) }
    const { width, height, domMap, settings } = state.capture
    const note = settings ? describeCapture(settings) : null
    try {
      res.json(success({ text: exportFeedback(annotations, width, height, null, domMap, note) }))
    } catch (formatError) {
      // The limits check no shape, so a mark without coordinates only fails here.
      res.status(400).json(failure(`Could not describe these annotations: ${formatError.message}`))
    }
  })
}

export function createApiRouter({ origin, targetLabel, state, voiceNotes = false, recapture = null, replies = null, resolveDecision }) {
  const router = Router()

  router.get('/api/image', (_req, res) => {
    // A recapture replaces the image behind the same URL.
    res.set('Cache-Control', 'no-store').type(sniffImageType(state.capture.buffer)).send(state.capture.buffer)
  })

  router.get('/api/meta', (_req, res) => {
    const { width, height, settings } = state.capture
    res.json(success({ width, height, origin, targetLabel, voiceNotes, capture: captureMeta(settings) }))
  })

  // Lets the client outline the element under the pointer and name the
  // element each annotation will be matched to, before anything is submitted.
  router.get('/api/elements', (_req, res) => {
    res.json(success({ elements: state.capture.domMap ?? [] }))
  })

  router.get('/api/annotations', (_req, res) => {
    res.json(success({ annotations: state.annotations }))
  })

  router.post('/api/annotations', (req, res) => {
    const { annotations, error } = annotationsFromBody(req.body)
    if (error) { return res.status(400).json(failure(error)) }
    state.annotations = [...annotations]
    res.json(success({ saved: true, count: annotations.length }))
  })

  mountRecapture(router, { state, recapture })
  mountExport(router, { state })

  router.post('/api/approve', async (_req, res) => {
    if (state.annotations.length === 0) {
      const pending = replies?.count() ?? 0
      res.json(success({ message: pending > 0 ? 'Approved with notes' : 'Approved' }))
      setTimeout(() => resolveDecision(pending > 0
        ? { approved: true, output: '', annotationCount: pending, annotations: [], repliesOnly: true, domMap: state.capture.domMap }
        : { approved: true, output: formatApprovalOutput(), annotations: [], domMap: state.capture.domMap }), 100)
      return
    }
    try {
      const { width, height, annotatedImagePath, domMap, note } = await decisionInputs(state)
      const output = formatApprovalWithNotesOutput(state.annotations, width, height, annotatedImagePath, domMap, note)
      res.json(success({ message: 'Approved with notes' }))
      setTimeout(
        () => resolveDecision({
          approved: true, output, annotationCount: state.annotations.length, annotations: state.annotations, domMap: state.capture.domMap
        }),
        100
      )
    } catch (error) {
      console.error(error)
      res.status(500).json(failure(error.message))
    }
  })

  router.post('/api/feedback', async (_req, res) => {
    if (state.annotations.length === 0) {
      const pending = replies?.count() ?? 0
      if (pending === 0) { return res.status(400).json(failure('No annotations to submit: use Approve instead')) }
      res.json(success({ message: 'Feedback submitted' }))
      setTimeout(() => resolveDecision({
        approved: false, output: '', annotationCount: pending, annotations: [], repliesOnly: true, domMap: state.capture.domMap
      }), 100)
      return
    }
    try {
      const { width, height, annotatedImagePath, domMap, note } = await decisionInputs(state)
      const output = exportFeedback(state.annotations, width, height, annotatedImagePath, domMap, note)
      res.json(success({ message: 'Feedback submitted' }))
      setTimeout(
        () => resolveDecision({
          approved: false, output, annotationCount: state.annotations.length, annotations: state.annotations, domMap: state.capture.domMap
        }),
        100
      )
    } catch (error) {
      console.error(error)
      res.status(500).json(failure(error.message))
    }
  })

  return router
}
