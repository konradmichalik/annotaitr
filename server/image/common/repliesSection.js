import { annotationLabel } from './feedback.js'
import { isNumbered, intentOf, intentWord } from '../../core/notes.js'
import { formatReplies } from '../../core/session/repliesFormat.js'
import { describePosition } from './geometry.js'
import { formatTimecode } from '../video/timeline.js'

const STILL_KINDS = new Set(['file', 'url', 'clipboard'])

function location(annotation, { kind, width, height }) {
  if (STILL_KINDS.has(kind) && width && height) { return describePosition(annotation, width, height) }
  if (kind === 'video' && typeof annotation.time === 'number') {
    return typeof annotation.endTime === 'number'
      ? `from ${formatTimecode(annotation.time)} to ${formatTimecode(annotation.endTime)}`
      : `at ${formatTimecode(annotation.time)}`
  }
  if (kind === 'document' && typeof annotation.page === 'number') { return `page ${annotation.page}` }
  return null
}

// The number belongs to the earlier round, so it stays out of the heading and goes into the quote.
function heading(thread, view) {
  const { annotation } = thread
  if (!isNumbered(annotation)) { return `### [#${thread.handle}] General comment` }
  const where = location(annotation, view)
  const what = annotation.type === 'comment' ? 'Comment' : annotationLabel(annotation)
  return `### [#${thread.handle}] ${intentWord(intentOf(annotation))} · ${what}${where ? `: ${where}` : ''}`
}

/** Last round's threads the reviewer answered, headed by where the mark sits on the image, in the recording or in the PDF. */
export function formatRepliesSection(carried, view) {
  return formatReplies(carried, view.round, { heading: (thread) => heading(thread, view) })
}
