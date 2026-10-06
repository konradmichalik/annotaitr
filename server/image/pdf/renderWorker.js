/**
 * Renders the pages of one PDF, off the main thread. pdf.js parses the file
 * in this worker's own JS context, so a slow or hostile page stalls only
 * the worker, and renderer.js can terminate it without touching the server.
 */

import { parentPort, workerData } from 'node:worker_threads'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'

const pdfjsDir = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))

function describeError(error) {
  return { name: error?.name ?? 'Error', code: error?.code ?? null, message: error?.message ?? String(error) }
}

// Larger images are left out instead of decoded: their pixels live outside
// the heap that the worker's resource limits bound.
const MAX_IMAGE_PIXELS = 64 * 1024 * 1024

function openDocument(data) {
  return getDocument({
    data,
    standardFontDataUrl: `${pdfjsDir}/standard_fonts/`,
    cMapUrl: `${pdfjsDir}/cmaps/`,
    // CVE-2024-4367 ran attacker JavaScript through font compilation.
    isEvalSupported: false,
    enableXfa: false,
    maxImageSize: MAX_IMAGE_PIXELS,
    verbosity: 0
  }).promise
}

async function pageSize(doc, number) {
  const { width, height } = (await doc.getPage(number)).getViewport({ scale: 1 })
  return { width, height }
}

function viewportFor(page, longSide) {
  const base = page.getViewport({ scale: 1 })
  return page.getViewport({ scale: longSide / Math.max(base.width, base.height) })
}

// Bounds what one page can hand back; real pages stay far below.
const MAX_TEXT_RUNS = 5000

/**
 * The page's text runs and links, with boxes in the pixels of the page
 * rendered at `longSide`. A run's box spans from its descent below the
 * baseline to its ascent above it, estimated from the font size.
 */
async function pageText(doc, { page: number, longSide }) {
  const page = await doc.getPage(number)
  const viewport = viewportFor(page, longSide)
  const toBox = ([left, low, right, high]) => {
    const [x1, y1] = viewport.convertToViewportPoint(left, low)
    const [x2, y2] = viewport.convertToViewportPoint(right, high)
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }
  }
  const { items } = await page.getTextContent()
  const runs = items
    .filter((item) => typeof item.str === 'string' && item.str.trim())
    .slice(0, MAX_TEXT_RUNS)
    .map((item) => {
      const [a, b, , , x, y] = item.transform
      const size = Math.hypot(a, b)
      return { str: item.str, fontSize: size * viewport.scale, box: toBox([x, y - size * 0.2, x + item.width, y + size * 0.8]) }
    })
  const links = (await page.getAnnotations())
    .filter((annotation) => annotation.subtype === 'Link' && typeof annotation.url === 'string')
    .map((annotation) => ({ url: annotation.url, box: toBox(annotation.rect) }))
  page.cleanup()
  return { runs, links }
}

async function renderPage(doc, { page: number, longSide }) {
  const page = await doc.getPage(number)
  const viewport = viewportFor(page, longSide)
  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height))
  await page.render({ canvas, viewport }).promise
  page.cleanup()
  return { buffer: canvas.toBuffer('image/png'), width: canvas.width, height: canvas.height }
}

try {
  const doc = await openDocument(workerData.data)
  parentPort.on('message', async (request) => {
    try {
      // The canvas buffer is not transferable, so it is copied: tens of kilobytes per page.
      const handler = request.size ? pageSize : (request.text ? pageText : renderPage)
      const result = await handler(doc, request.size ? request.page : request)
      parentPort.postMessage({ id: request.id, result })
    } catch (error) {
      parentPort.postMessage({ id: request.id, error: describeError(error) })
    }
  })
  parentPort.postMessage({ type: 'ready', pageCount: doc.numPages })
} catch (error) {
  parentPort.postMessage({ type: 'failed', error: describeError(error) })
}
