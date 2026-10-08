/**
 * Page-axis helpers for reviewing a PDF. isPaged and
 * orderDocumentAnnotations mirror server/image/document/pages.js (client and server
 * share no modules, so the duplication is deliberate): cards and marks are
 * listed in the order the agent's feedback lists them.
 */

export function isPaged(annotation) {
  return Number.isInteger(annotation.page)
}

export function orderDocumentAnnotations(annotations) {
  const paged = annotations.filter(isPaged).sort((a, b) => a.page - b.page)
  return [...paged, ...annotations.filter((a) => !isPaged(a))]
}

export function pageAnnotationCounts(annotations) {
  const counts = new Map()
  for (const annotation of annotations.filter(isPaged)) {
    counts.set(annotation.page, (counts.get(annotation.page) ?? 0) + 1)
  }
  return counts
}

/** The reviewed page `delta` steps from `current`, clamped; ±Infinity jumps to the first or last. */
export function stepPage(pages, current, delta) {
  const index = pages.findIndex((p) => p.number === current)
  return pages[Math.max(0, Math.min(pages.length - 1, index + delta))].number
}

export function pageLabel(annotation) {
  return isPaged(annotation) ? `Page ${annotation.page}` : 'Whole document'
}
