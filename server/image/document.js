import { stat } from 'node:fs/promises'
import { createPdfRenderer } from './pdf/renderer.js'
import { selectPages } from './pages.js'
import { config } from './config.js'

// Slides come out at 2000x1125, an A4 page at about 1414x2000.
export const PAGE_LONG_SIDE = 2000
export const THUMB_LONG_SIDE = 240
// The page on screen and its neighbours; anything else is rendered again.
const PAGE_CACHE_SIZE = 6

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
  const { pages, error } = selectPages(pageRanges, renderer.pageCount)
  if (error) {
    await renderer.close()
    throw new Error(error)
  }
  return {
    path: pdfPath,
    renderer,
    pageCount: renderer.pageCount,
    pages: pages.map((number) => ({ number, ...pixelSize(renderer.pageSizes[number - 1], PAGE_LONG_SIDE) }))
  }
}

/**
 * Rendered pages as PNG buffers, at most `capacity` kept, least recently
 * used dropped first. A render in flight is shared by everyone asking for
 * the same page; a failed one is forgotten so the next request retries.
 */
export function createPageCache(render, capacity = PAGE_CACHE_SIZE) {
  const entries = new Map()
  return {
    get(page) {
      let pending = entries.get(page)
      if (pending) {
        entries.delete(page)
      } else {
        pending = render(page).then((result) => result.buffer)
        pending.catch(() => entries.delete(page))
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
    pages: createPageCache((page) => document.renderer.render(page, PAGE_LONG_SIDE)),
    thumbs: createPageCache((page) => document.renderer.render(page, THUMB_LONG_SIDE), Infinity)
  }
}
