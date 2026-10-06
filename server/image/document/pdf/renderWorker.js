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

async function pageSize(doc, { page: number }) {
  const { width, height } = (await doc.getPage(number)).getViewport({ scale: 1 })
  return { width, height }
}

function viewportFor(page, longSide) {
  const base = page.getViewport({ scale: 1 })
  return page.getViewport({ scale: longSide / Math.max(base.width, base.height) })
}

// Bound what one page can make the worker do and hand back; real pages stay
// far below. The caps apply before any word is measured.
const MAX_TEXT_ITEMS = 5000
const MAX_ITEM_LENGTH = 2000
const MAX_LINKS = 500

// pdf.js reports where a text run starts and how wide it is, not where its
// words are. Each word's share of the run is measured in a generic sans
// serif and scaled to the run's real width: close enough for a selection
// to snap to whole words in most fonts.
const measure = createCanvas(1, 1).getContext('2d')
measure.font = '100px sans-serif'

/** The words of a run as fractions of its width, measured chunk by chunk in one pass. */
function wordShares(str) {
  const words = []
  let offset = 0
  for (const chunk of str.match(/\s+|\S+/g) ?? []) {
    const width = measure.measureText(chunk).width
    if (chunk.trim()) { words.push({ str: chunk, from: offset, to: offset + width }) }
    offset += width
  }
  const total = offset || 1
  return words.map((word) => ({ str: word.str, from: word.from / total, to: word.to / total }))
}

/**
 * The words of one text item in the rendered page's pixels, or none when the
 * item does not run left to right on screen: rotated and vertical text is
 * left out rather than given boxes that miss its glyphs.
 */
function itemWords(item, viewport) {
  const [a, b, , , x, y] = item.transform
  const size = Math.hypot(a, b)
  if (!size) { return [] }
  const [x0, y0] = viewport.convertToViewportPoint(x, y)
  const [x1, y1] = viewport.convertToViewportPoint(x + (a / size) * item.width, y + (b / size) * item.width)
  if (x1 <= x0 || Math.abs(y1 - y0) > (x1 - x0) * 0.05) { return [] }
  const fontSize = size * viewport.scale
  return wordShares(item.str.slice(0, MAX_ITEM_LENGTH)).map((word) => ({
    str: word.str,
    fontSize,
    baseline: y0,
    // From the descent below the baseline to the ascent above it, estimated from the font size.
    box: { x: x0 + (x1 - x0) * word.from, y: y0 - fontSize * 0.8, width: (x1 - x0) * (word.to - word.from), height: fontSize }
  }))
}

/** The page's words and links, with boxes in the pixels of the page rendered at `longSide`. */
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
    .slice(0, MAX_TEXT_ITEMS)
    .flatMap((item) => itemWords(item, viewport))
  const links = (await page.getAnnotations())
    .filter((annotation) => annotation.subtype === 'Link' && typeof annotation.url === 'string')
    .slice(0, MAX_LINKS)
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

const HANDLERS = { size: pageSize, text: pageText, render: renderPage }

try {
  const doc = await openDocument(workerData.data)
  parentPort.on('message', async (request) => {
    try {
      // The canvas buffer is not transferable, so it is copied: tens of kilobytes per page.
      const result = await HANDLERS[request.kind](doc, request)
      parentPort.postMessage({ id: request.id, result })
    } catch (error) {
      parentPort.postMessage({ id: request.id, error: describeError(error) })
    }
  })
  parentPort.postMessage({ type: 'ready', pageCount: doc.numPages })
} catch (error) {
  parentPort.postMessage({ type: 'failed', error: describeError(error) })
}
