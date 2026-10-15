/**
 * The "Replies to round N" section every mode prints after its feedback. A
 * mode only says how a thread's heading reads and which detail lines follow it.
 */

const lines = (text) => String(text ?? '').replace(/\r\n/g, '\n').split('\n')

const plural = (count) => (count === 1 ? 'reply' : 'replies')

// The reviewer's original words are quoted line by line so a multi-line comment stays one block.
// `noun` is what the mode calls a numbered item: an image has marks, a document has notes.
export function quote(origin, text, noun = 'mark') {
  const [first, ...rest] = lines(text)
  const mark = origin.number === null || origin.number === undefined ? 'general comment' : `${noun} ${origin.number}`
  const where = origin.where ? ` (${origin.where})` : ''
  return [`> Round ${origin.round}, ${mark}${where}: ${first}`, ...rest.map((line) => `> ${line}`)].join('\n')
}

export function replyLine(reply) {
  const who = reply.author === 'human' ? 'Reviewer' : `Agent (${reply.status})`
  const [first, ...rest] = lines(reply.text)
  // Four spaces keep a reply line from reading as a heading, two still do in CommonMark.
  return [`${who}: ${first}`, ...rest.map((line) => `    ${line}`)].join('\n')
}

const elementLine = (thread) => (thread.element ? [`Element: ${thread.element}`] : [])

function threadBlock(thread, { heading, details = elementLine, noun }) {
  const block = [heading(thread), ...details(thread), quote(thread.origin, thread.annotation.text, noun), ...thread.replies.map(replyLine)]
  return `${block.join('\n')}\n`
}

/**
 * Last round's threads the reviewer answered, as the whole exchange, so the
 * agent sees a reply to its reply. `heading(thread)` is the mode's heading
 * line, `details(thread)` the lines under it (the matched element by default),
 * `noun` what it calls a numbered item (`mark` by default).
 */
export function formatReplies(carried, round, format) {
  if (carried.length === 0) { return '' }
  return `\n## Replies to round ${round}\n\n${carried.map((t) => threadBlock(t, format)).join('\n')}`
}

/** The verdict line of a decision that carries replies but no new marks. */
export function formatRepliesOnlyHeader({ approved, count, round, noun = 'mark' }) {
  return approved
    ? `APPROVED WITH NOTES: ${count} ${plural(count)} to round ${round}. The target is approved as-is. Treat the replies below as context, not as change requests.\n`
    : `Feedback: ${count} ${plural(count)} to round ${round}, no new ${noun}s.\n`
}
