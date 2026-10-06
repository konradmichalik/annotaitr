import { describePosition, findNearbyAnnotationNumbers } from './geometry.js'
import { annotationLabel } from './feedback.js'
import { annotationHandle } from '../core/annotationHandle.js'
import { isPaged } from './pages.js'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Nearby markers only count within one page, since each page is its own image. */
function nearbyNumbers(plan, document) {
  const result = new Map()
  for (const { page, entries } of plan) {
    const { width, height } = pageSize(document, page)
    const placed = entries.filter((e) => e.annotation.type !== 'comment')
    const nearby = findNearbyAnnotationNumbers(placed.map((e) => e.annotation), width, height)
    placed.forEach((entry, i) => result.set(entry.annotation, nearby[i].map((local) => placed[local - 1].number)))
  }
  return result
}

function pageSize(document, number) {
  return document.pages.find((p) => p.number === number)
}

function quote(text) {
  // A bare \r would otherwise end the quote and let text pass as a heading.
  return text ? `> ${text.replace(/\r\n?|\n/g, '\n> ')}` : '> (no comment text)'
}

function heading(annotation, document, nearby) {
  if (!isPaged(annotation)) { return 'General comment about the whole document' }
  if (annotation.type === 'comment') { return 'Page comment' }
  const { width, height } = pageSize(document, annotation.page)
  const nearbyNote = nearby.length > 0
    ? `, close to annotation${nearby.length > 1 ? 's' : ''} ${nearby.join(', ')}, check the numbered marker on the page`
    : ''
  return `${annotationLabel(annotation)}: ${describePosition(annotation, width, height)}${nearbyNote}`
}

function entry(annotation, number, document, nearby) {
  const handle = annotationHandle(annotation.id)
  const marker = handle ? `${number}. [#${handle}]` : `${number}.`
  return `### ${marker} ${heading(annotation, document, nearby)}\n${quote(annotation.text)}\n`
}

function formatSections({ ordered, plan, document, files }) {
  const nearby = nearbyNumbers(plan, document)
  const sections = plan.map(({ page, entries }) => {
    const image = files ? `Annotated page: ${files.pages.get(page)}\n` : ''
    const body = entries.map((e) => entry(e.annotation, e.number, document, nearby.get(e.annotation) ?? [])).join('\n')
    return `## Page ${page}\n${image}\n${body}`
  })
  const general = ordered
    .map((annotation, index) => ({ annotation, number: index + 1 }))
    .filter(({ annotation }) => !isPaged(annotation))
  if (general.length > 0) {
    sections.push(`## General\n${general.map((e) => entry(e.annotation, e.number, document, [])).join('\n')}`)
  }
  return sections.join('\n')
}

// The agent edits the source, never the PDF. If the source changed after the
// export, the reviewer may have looked at an old rendering.
function header({ document, source, files }) {
  let lines = source
    ? `Source: ${source.label} (rendered as ${document.label})\n`
    : `Source: ${document.label}\n`
  if (source?.newer) {
    lines += `Warning: ${source.label} was newer than ${document.label} when the review started, so the notes may refer to an outdated rendering.\n`
  }
  if (files?.overview) { lines += `Overview: ${files.overview}\n` }
  return lines
}

function pageCountLine(plan, document) {
  const reviewed = document.pages.length
  return reviewed === document.pageCount
    ? `${plan.length} of ${plural(reviewed, 'page')}`
    : `${plan.length} of ${reviewed} reviewed pages (the document has ${document.pageCount})`
}

/**
 * Feedback on a PDF. Every page with annotations has its own image with the
 * markup baked in; numbers run across the whole document, so a number means
 * the same on the image and in the text.
 */
export function exportDocumentFeedback(context) {
  const { ordered, plan, document } = context
  return `${plural(ordered.length, 'annotation')} on ${pageCountLine(plan, document)}.\n\n` +
    header(context) +
    'Look at each page image, then match each note below to the visible element or quoted text.\n\n' +
    formatSections(context)
}

export function formatDocumentApprovalWithNotes(context) {
  return `APPROVED WITH NOTES: ${plural(context.ordered.length, 'note')}. ` +
    'The document is approved as-is. Treat the notes below as context, not as change requests.\n\n' +
    header(context) + '\n' +
    formatSections(context) + '\n'
}
