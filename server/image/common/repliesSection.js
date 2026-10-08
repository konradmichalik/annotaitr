import { annotationLabel } from './feedback.js'
import { isNumbered, intentOf, intentWord } from '../../core/notes.js'
import { describePosition } from './geometry.js'
import { formatTimecode } from '../video/timeline.js'

const STILL_KINDS = new Set(['file', 'url', 'clipboard'])

const lines = (text) => String(text ?? '').replace(/\r\n/g, '\n').split('\n')

const plural = (count) => (count === 1 ? 'reply' : 'replies')

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

// The reviewer's original words are quoted line by line so a multi-line comment stays one block.
function quote(origin, text) {
  const [first, ...rest] = lines(text)
  const mark = origin.number === null || origin.number === undefined ? 'general comment' : `mark ${origin.number}`
  return [`> Round ${origin.round}, ${mark}: ${first}`, ...rest.map((line) => `> ${line}`)].join('\n')
}

function replyLine(reply) {
  const who = reply.author === 'human' ? 'Reviewer' : `Agent (${reply.status})`
  const [first, ...rest] = lines(reply.text)
  // Four spaces keep a reply line from reading as a heading, two still do in CommonMark.
  return [`${who}: ${first}`, ...rest.map((line) => `    ${line}`)].join('\n')
}

function threadBlock(thread, view) {
  const lines = [heading(thread, view)]
  if (thread.element) { lines.push(`Element: ${thread.element}`) }
  lines.push(quote(thread.origin, thread.annotation.text), ...thread.replies.map(replyLine))
  return `${lines.join('\n')}\n`
}

/** Last round's threads the reviewer answered, as the whole exchange, so the agent sees a reply to its reply. */
export function formatRepliesSection(carried, view) {
  if (carried.length === 0) { return '' }
  return `\n## Replies to round ${view.round}\n\n${carried.map((t) => threadBlock(t, view)).join('\n')}`
}

/** The verdict line of a decision that carries replies but no new marks. */
export function formatRepliesOnlyHeader({ approved, count, round }) {
  return approved
    ? `APPROVED WITH NOTES: ${count} ${plural(count)} to round ${round}. The target is approved as-is. Treat the replies below as context, not as change requests.\n`
    : `Feedback: ${count} ${plural(count)} to round ${round}, no new marks.\n`
}
