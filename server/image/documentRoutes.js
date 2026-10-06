import { Router } from 'express'
import { annotationsFromBody } from './routes.js'
import { flattenAnnotations } from './render.js'
import { formatApprovalOutput } from './feedback.js'
import { exportDocumentFeedback, formatDocumentApprovalWithNotes } from './documentFeedback.js'
import { orderDocumentAnnotations, planDocumentPages, validateDocumentAnnotations } from './pages.js'
import { writeDocumentOutput } from './documentOutput.js'
import { elementsForPages } from './document.js'

function success(data) { return { success: true, data } }
function failure(error) { return { success: false, error } }

/**
 * A rendered page from `cache`. A render shared with a request that was
 * abandoned is dropped with it, so this request asks once more on its own.
 */
async function pageFor(cache, page, signal, options) {
  try {
    return await cache.get(page, signal, options)
  } catch (error) {
    if (error.name !== 'AbortError' || signal.aborted) { throw error }
    return cache.get(page, signal, options)
  }
}

function mountPageRoutes(router, { review, caches }) {
  const servePage = (cache) => async (req, res) => {
    const page = Number(req.params.page)
    if (!review.pageNumbers.has(page)) { return res.status(404).json(failure(`Page ${req.params.page} is not part of this review`)) }
    // A page the reviewer has already moved past is not rendered any more.
    const abandoned = new AbortController()
    res.on('close', () => { if (!res.writableEnded) { abandoned.abort() } })
    try {
      // The client marks a page it fetches ahead of the reviewer.
      res.type('png').send(await pageFor(cache, page, abandoned.signal, { prefetch: req.query.prefetch === '1' }))
    } catch (error) {
      if (abandoned.signal.aborted) { return }
      // The client shows this on the page instead of the image.
      res.status(502).json(failure(error.message))
    }
  }
  router.get('/api/pages/:page/image', servePage(caches.pages))
  router.get('/api/pages/:page/thumb', servePage(caches.thumbs))

  // Lets the client outline the text under the pointer, offer the Element
  // tool and snap a text selection to words.
  router.get('/api/pages/:page/elements', async (req, res) => {
    const page = Number(req.params.page)
    if (!review.pageNumbers.has(page)) { return res.status(404).json(failure(`Page ${req.params.page} is not part of this review`)) }
    res.json(success(await caches.text.get(page)))
  })
}

function mountAnnotationRoutes(router, { review, state }) {
  router.get('/api/annotations', (_req, res) => {
    res.json(success({ annotations: state.annotations }))
  })

  router.post('/api/annotations', (req, res) => {
    const { annotations, error } = review.checked(req.body)
    if (error) { return res.status(400).json(failure(error)) }
    state.annotations = [...annotations]
    res.json(success({ saved: true, count: annotations.length }))
  })
}

/**
 * One page with its markup, numbered as in the feedback, and the feedback as
 * Markdown, for copying and saving from the annotator. Annotations come with
 * the request, nothing is decided.
 */
function mountExportRoutes(router, { review, caches }) {
  router.post('/api/annotated-image', async (req, res) => {
    const { annotations, error } = review.checked(req.body)
    if (error) { return res.status(400).json(failure(error)) }
    const page = Number(req.body.page)
    if (!review.pageNumbers.has(page)) { return res.status(400).json(failure('page must be one of the reviewed pages')) }
    const entries = review.context(annotations, null).plan.find((p) => p.page === page)?.entries ?? []
    try {
      const buffer = await flattenAnnotations(await caches.pages.get(page), entries.map((e) => e.annotation), entries.map((e) => e.number))
      res.type('png').send(buffer)
    } catch (renderError) {
      res.status(500).json(failure(renderError.message))
    }
  })

  router.post('/api/feedback-text', async (req, res) => {
    const { annotations, error } = review.checked(req.body)
    if (error) { return res.status(400).json(failure(error)) }
    try {
      res.json(success({ text: exportDocumentFeedback(await review.withElements(review.context(annotations, null))) }))
    } catch (formatError) {
      res.status(400).json(failure(`Could not describe these annotations: ${formatError.message}`))
    }
  })
}

function mountDecisionRoutes(router, { review, state, caches, document, resolveDecision }) {
  const rejectWhileDeciding = (_req, res, next) => {
    if (state.deciding || state.decided) { return res.status(409).json(failure('A decision is already being submitted')) }
    next()
  }

  async function decide(res, { approved }) {
    state.deciding = true
    try {
      const base = await review.withElements(review.context(state.annotations, null))
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
}

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
  const review = {
    pageNumbers,
    checked(body) {
      const { annotations, error } = annotationsFromBody(body)
      if (error) { return { error } }
      const pageError = validateDocumentAnnotations(annotations, pageNumbers)
      return pageError ? { error: pageError } : { annotations }
    },
    context(annotations, files) {
      const ordered = orderDocumentAnnotations(annotations)
      return { ordered, plan: planDocumentPages(ordered), document: docInfo, source, files, elements: new Map() }
    },
    /** The context with the element maps of its annotated pages, for the `Text:` lines. */
    async withElements(ctx) {
      return { ...ctx, elements: await elementsForPages(caches, ctx.plan.map((p) => p.page)) }
    }
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

  // The client asks this of every image target; a PDF's element maps are per page.
  router.get('/api/elements', (_req, res) => {
    res.json(success({ elements: [] }))
  })

  mountPageRoutes(router, { review, caches })
  mountAnnotationRoutes(router, { review, state })
  mountExportRoutes(router, { review, caches })
  mountDecisionRoutes(router, { review, state, caches, document, resolveDecision })
  return router
}
