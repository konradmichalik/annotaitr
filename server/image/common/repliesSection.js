import { annotationLabel } from './feedback.js'
import { describePosition } from './geometry.js'
import { formatTimecode } from '../video/timeline.js'

const STILL_KINDS = new Set(['file', 'url', 'clipboard'])

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

function heading(thread, view) {
  if (thread.annotation.type === 'comment') { return `### [#${thread.handle}] General comment` }
  const where = location(thread.annotation, view)
  return `### [#${thread.handle}] ${annotationLabel(thread.annotation)}${where ? `: ${where}` : ''}`
}

// The reviewer's original words are quoted line by line so a multi-line comment stays one block.
function quote(origin, text) {
  const [first, ...rest] = String(text ?? '').split('\n')
  return [`> Round ${origin.round}, mark ${origin.number}: ${first}`, ...rest.map((line) => `> ${line}`)].join('\n')
}

function replyLine(reply) {
  const who = reply.author === 'human' ? 'Reviewer' : `Agent (${reply.status})`
  const [first, ...rest] = reply.text.split('\n')
  return [`${who}: ${first}`, ...rest.map((line) => `  ${line}`)].join('\n')
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
