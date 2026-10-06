import { stat } from 'node:fs/promises'
import { createPdfRenderer } from './pdf/renderer.js'
import { selectPages } from './pages.js'
import { config } from './config.js'

// Slides come out at 2000x1125, an A4 page at about 1414x2000.
export const PAGE_LONG_SIDE = 2000
export const THUMB_LONG_SIDE = 240
// The page on screen and its neighbours; anything else is rendered again.
const PAGE_CACHE_SIZE = 6
// A failed render is answered from the cache for a moment, so asking why an
// image did not load does not queue the same slow page again.
const FAILURE_TTL_MS = 5000
// The page on screen goes before thumbnails scrolled into view.
const PAGE_PRIORITY = 1
const THUMB_PRIORITY = 0

function pixelSize({ width, height }, longSide) {
  const scale = longSide / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Open a PDF for review before the browser opens: parse it in the render
 * worker, pick the session's pages and size each one in the pixels its
 * image will have, which is also the space annotation geometry lives in.
 */
export async function openPdfDocument(pdfPath, { pageRanges = null } = {}) {
  const { size } = await stat(pdfPath)
  if (size > config.maxPdfBytes) {
    throw new Error(`PDF too large: ${pdfPath} (${size} bytes, max ${config.maxPdfBytes})`)
  }
  const renderer = await createPdfRenderer(pdfPath)
  try {
    const { pages, error } = selectPages(pageRanges, renderer.pageCount)
    if (error) { throw new Error(error) }
    // Only the session's pages are sized: a long document never has all of them parsed.
    const sizes = await Promise.all(pages.map((number) => renderer.pageSize(number)))
    return {
      path: pdfPath,
      renderer,
      pageCount: renderer.pageCount,
      pages: pages.map((number, i) => ({ number, ...pixelSize(sizes[i], PAGE_LONG_SIDE) }))
    }
  } catch (error) {
    await renderer.close()
    throw error
  }
}

/**
 * Rendered pages as PNG buffers, at most `capacity` kept, least recently
 * used dropped first. A render in flight is shared by everyone asking for
 * the same page; a failed one is kept for `failureTtlMs`, then forgotten so
 * the next request retries. `signal` lets a render that has not started yet
 * be dropped when the browser stops waiting for it.
 */
export function createPageCache(render, capacity = PAGE_CACHE_SIZE, failureTtlMs = FAILURE_TTL_MS) {
  const entries = new Map()
  return {
    get(page, signal = null) {
      let pending = entries.get(page)
      if (pending) {
        entries.delete(page)
      } else {
        pending = render(page, signal).then((result) => result.buffer)
        // Only this render's own entry: a newer one for the page may have replaced it.
        const forget = () => { if (entries.get(page) === pending) { entries.delete(page) } }
        pending.catch((error) => (error.name === 'AbortError' ? forget() : setTimeout(forget, failureTtlMs).unref()))
      }
      entries.set(page, pending)
      if (entries.size > capacity) { entries.delete(entries.keys().next().value) }
      return pending
    }
  }
}

/** The full-size pages (a few at a time) and the thumbnails (all of them, they are small) of a document. */
export function createDocumentCaches(document) {
  return {
    pages: createPageCache((page, signal) => document.renderer.render(page, PAGE_LONG_SIDE, { priority: PAGE_PRIORITY, signal })),
    thumbs: createPageCache((page, signal) => document.renderer.render(page, THUMB_LONG_SIDE, { priority: THUMB_PRIORITY, signal }), Infinity)
  }
}
