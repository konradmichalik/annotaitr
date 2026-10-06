import { Router } from 'express'
import { annotationsFromBody } from './routes.js'
import { flattenAnnotations } from './render.js'
import { formatApprovalOutput } from './feedback.js'
import { exportDocumentFeedback, formatDocumentApprovalWithNotes } from './documentFeedback.js'
import { orderDocumentAnnotations, planDocumentPages, validateDocumentAnnotations } from './pages.js'
import { writeDocumentOutput } from './documentOutput.js'

function success(data) { return { success: true, data } }
function failure(error) { return { success: false, error } }

/**
 * The document variant of image mode's API. Pages are rendered on the
 * server on first request (full size and thumbnail separately), annotations
 * carry the page they belong to, and a decision writes one image per
 * annotated page plus an overview.
 */
export function createDocumentApiRouter({ document, source, origin, targetLabel, state, caches, voiceNotes = false, resolveDecision }) {
  const router = Router()
  const pageNumbers = new Set(document.pages.map((p) => p.number))
  const docInfo = { label: targetLabel, pageCount: document.pageCount, pages: document.pages }

  function checkedAnnotations(body) {
    const { annotations, error } = annotationsFromBody(body)
    if (error) { return { error } }
    const pageError = validateDocumentAnnotations(annotations, pageNumbers)
    return pageError ? { error: pageError } : { annotations }
  }

  function context(annotations, files) {
    const ordered = orderDocumentAnnotations(annotations)
    return { ordered, plan: planDocumentPages(ordered), document: docInfo, source, files }
  }

  router.get('/api/meta', (_req, res) => {
    res.json(success({
      kind: 'document', origin, targetLabel, voiceNotes,
      pageCount: document.pageCount,
      pages: document.pages,
      source: source?.label ?? null,
      sourceIsNewer: source?.newer ?? false
    }))
  })

  const servePage = (cache) => async (req, res) => {
    const page = Number(req.params.page)
    if (!pageNumbers.has(page)) { return res.status(404).json(failure(`Page ${req.params.page} is not part of this review`)) }
    try {
      res.type('png').send(await cache.get(page))
    } catch (error) {
      // The client shows this on the page instead of the image.
      res.status(502).json(failure(error.message))
    }
  }
  router.get('/api/pages/:page/image', servePage(caches.pages))
  router.get('/api/pages/:page/thumb', servePage(caches.thumbs))

  // The text layer as element map follows later; until then a PDF has none.
  router.get('/api/elements', (_req, res) => {
    res.json(success({ elements: [] }))
  })

  router.get('/api/annotations', (_req, res) => {
    res.json(success({ annotations: state.annotations }))
  })

  router.post('/api/annotations', (req, res) => {
    const { annotations, error } = checkedAnnotations(req.body)
    if (error) { return res.status(400).json(failure(error)) }
    state.annotations = [...annotations]
    res.json(success({ saved: true, count: annotations.length }))
  })

  // One page with its markup, numbered as in the feedback, for copying and
  // saving from the annotator. Annotations come with the request, nothing is decided.
  router.post('/api/annotated-image', async (req, res) => {
    const { annotations, error } = checkedAnnotations(req.body)
    if (error) { return res.status(400).json(failure(error)) }
    const page = Number(req.body.page)
    if (!pageNumbers.has(page)) { return res.status(400).json(failure('page must be one of the reviewed pages')) }
    const entries = context(annotations, null).plan.find((p) => p.page === page)?.entries ?? []
    try {
      const buffer = await flattenAnnotations(await caches.pages.get(page), entries.map((e) => e.annotation), entries.map((e) => e.number))
      res.type('png').send(buffer)
    } catch (renderError) {
      res.status(500).json(failure(renderError.message))
    }
  })

  router.post('/api/feedback-text', (req, res) => {
    const { annotations, error } = checkedAnnotations(req.body)
    if (error) { return res.status(400).json(failure(error)) }
    try {
      res.json(success({ text: exportDocumentFeedback(context(annotations, null)) }))
    } catch (formatError) {
      res.status(400).json(failure(`Could not describe these annotations: ${formatError.message}`))
    }
  })

  const rejectWhileDeciding = (_req, res, next) => {
    if (state.deciding || state.decided) { return res.status(409).json(failure('A decision is already being submitted')) }
    next()
  }

  async function decide(res, { approved }) {
    state.deciding = true
    try {
      const base = context(state.annotations, null)
      const files = await writeDocumentOutput(base.plan, (page) => caches.pages.get(page), document.pageCount)
      const ctx = { ...base, files }
      const output = approved ? formatDocumentApprovalWithNotes(ctx) : exportDocumentFeedback(ctx)
      state.decided = true
      res.json(success({ message: approved ? 'Approved with notes' : 'Feedback submitted' }))
      setTimeout(() => resolveDecision({ approved, output, annotationCount: ctx.ordered.length }), 100)
    } catch (error) {
      console.error(error)
      res.status(500).json(failure(error.message))
    } finally {
      state.deciding = false
    }
  }

  router.post('/api/approve', rejectWhileDeciding, async (_req, res) => {
    if (state.annotations.length === 0) {
      state.decided = true
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
