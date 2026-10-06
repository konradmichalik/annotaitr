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

async function renderPage(doc, { page: number, longSide }) {
  const page = await doc.getPage(number)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: longSide / Math.max(base.width, base.height) })
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
      const result = request.size ? await pageSize(doc, request.page) : await renderPage(doc, request)
      parentPort.postMessage({ id: request.id, result })
    } catch (error) {
      parentPort.postMessage({ id: request.id, error: describeError(error) })
    }
  })
  parentPort.postMessage({ type: 'ready', pageCount: doc.numPages })
} catch (error) {
  parentPort.postMessage({ type: 'failed', error: describeError(error) })
}
