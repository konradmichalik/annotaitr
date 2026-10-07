import { normalizeNotes } from '../../core/notes.js'

/**
 * Pure page-axis helpers for reviewing a PDF: the --pages selection,
 * annotation ordering and validation. The document counterpart of
 * timeline.js, where `page` plays the role of `time`.
 */

export const MAX_PAGES = 200
// A selection across a whole dense page stays well below both.
const MAX_TEXT_RECTS = 500
const MAX_QUOTE_LENGTH = 5000

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const isRect = (r) => isFiniteNumber(r?.x) && isFiniteNumber(r?.y) && isFiniteNumber(r?.width) && isFiniteNumber(r?.height)

/** A text selection: the lines it covers, the box around them and the selected words. */
function textSelectionError(annotation, label) {
  const { geometry, quote } = annotation
  if (!isRect(geometry) || !Array.isArray(geometry.rects) || geometry.rects.length === 0
    || geometry.rects.length > MAX_TEXT_RECTS || !geometry.rects.every(isRect)) {
    return `${label}: a text selection needs a box and 1 to ${MAX_TEXT_RECTS} line rectangles`
  }
  if (typeof quote !== 'string' || quote.length === 0 || quote.length > MAX_QUOTE_LENGTH) {
    return `${label}: a text selection needs the selected text (at most ${MAX_QUOTE_LENGTH} characters)`
  }
  return null
}

const ITEM = /^(\d+)(?:-(\d*))?$/

/** `1-5,8,12-` as ranges (`to: null` runs to the last page), or the error to report. */
export function parsePageRanges(spec) {
  const items = String(spec).split(',').map((item) => item.trim())
  const ranges = []
  for (const item of items) {
    const match = ITEM.exec(item)
    const from = match ? Number(match[1]) : 0
    const to = match?.[2] === undefined ? from : (match[2] === '' ? null : Number(match[2]))
    if (!match || from < 1 || (to !== null && to < from)) {
      return { error: `--pages: "${item}" is not a page or range. Use e.g. 1-5,8,12-` }
    }
    ranges.push({ from, to })
  }
  return { ranges }
}

/** The page numbers a session shows, in document order, or the error to report. */
export function selectPages(ranges, pageCount) {
  const selected = new Set()
  for (const { from, to } of ranges ?? [{ from: 1, to: null }]) {
    const last = to ?? pageCount
    const beyond = Math.max(from, last)
    if (beyond > pageCount) {
      return { error: `--pages: page ${beyond} is beyond the document's ${pageCount} pages` }
    }
    for (let page = from; page <= last; page++) { selected.add(page) }
  }
  if (selected.size > MAX_PAGES) {
    return { error: `${selected.size} pages are more than one review can hold (max ${MAX_PAGES}). Pick a part with --pages, e.g. --pages 1-${MAX_PAGES}` }
  }
  return { pages: [...selected].sort((a, b) => a - b) }
}

export function isPaged(annotation) {
  return Number.isInteger(annotation.page)
}

/**
 * The order annotations are numbered in: pages in document order, within a
 * page the order they were made in, comments about the whole document last.
 */
export function orderDocumentAnnotations(annotations) {
  const paged = annotations.filter(isPaged).sort((a, b) => a.page - b.page)
  // Notes from before numbers were stored are numbered in page order, as they used to be.
  return normalizeNotes([...paged, ...annotations.filter((a) => !isPaged(a))])
}

/** The first problem with the annotations' page fields, or null when they are all valid. */
export function validateDocumentAnnotations(annotations, pageNumbers) {
  for (const [index, annotation] of annotations.entries()) {
    const label = `Annotation ${index + 1}`
    // Checked here rather than when the feedback is formatted, which would
    // turn a bad entry into a failed decision.
    if (typeof annotation !== 'object' || annotation === null) { return `${label}: must be an object` }
    if (annotation.text !== undefined && annotation.text !== null && typeof annotation.text !== 'string') {
      return `${label}: text must be a string`
    }
    const hasPage = annotation.page !== undefined && annotation.page !== null
    if (annotation.type !== 'comment' && !hasPage) {
      return `${label}: a drawn annotation needs a page`
    }
    if (hasPage && !pageNumbers.has(annotation.page)) {
      return `${label}: page ${annotation.page} is not part of this review`
    }
    const textError = annotation.type === 'text' ? textSelectionError(annotation, label) : null
    if (textError) { return textError }
  }
  return null
}

/**
 * The pages to export, in document order, each with its annotations and the
 * numbers they carry in the feedback. `ordered` comes from
 * orderDocumentAnnotations(), which gives every note its number.
 */
export function planDocumentPages(ordered) {
  const pages = new Map()
  ordered.forEach((annotation, index) => {
    if (!isPaged(annotation)) { return }
    if (!pages.has(annotation.page)) { pages.set(annotation.page, []) }
    pages.get(annotation.page).push({ annotation, number: annotation.number ?? index + 1 })
  })
  return [...pages].map(([page, entries]) => ({ page, entries }))
}
