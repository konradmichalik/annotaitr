import { isNumbered, kindPrefix } from '../core/notes.js'
import { formatReplies } from '../core/session/repliesFormat.js'
import { noteWhat } from './feedback.js'

const QUOTE_LIMIT = 120

function oneLine(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > QUOTE_LIMIT ? `${flat.slice(0, QUOTE_LIMIT).trimEnd()}…` : flat
}

// A changes walkthrough is generated anew every round, so its own path means nothing to the agent.
function placeText(located, kind) {
  if (located?.anchor === 'orphan') { return kind === 'changes' ? 'no longer in the changes' : 'no longer in the document' }
  const place = located?.place
  if (!place) { return null }
  return [place.where, kind === 'changes' ? null : place.path].filter(Boolean).join(', ') || null
}

// The heading names where the text is now; where it was when raised stays in the quote line.
function heading(thread, located, kind) {
  const { annotation } = thread
  if (!isNumbered(annotation)) { return `### [#${thread.handle}] General comment` }
  const where = placeText(located, kind)
  return `### [#${thread.handle}] ${kindPrefix(annotation)}${noteWhat(annotation, null)}${where ? ` (${where})` : ''}`
}

// A code span needs a backtick run longer than any inside it, and a space where the text touches the fence.
function codeSpan(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  const pad = longest > 0 ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

function details(thread) {
  const quote = thread.anchor?.quote
  if (!quote) { return [] }
  return [`${thread.annotation.type === 'INSERTION' ? 'After' : 'Selected'}: ${codeSpan(oneLine(quote))}`]
}

/**
 * Last round's threads the reviewer answered. `places` maps a handle to where
 * the thread was found in this round (`{ anchor, place }`), `kind` is
 * `markdown` or `changes`.
 */
export function formatMarkdownReplies(carried, round, { places, kind }) {
  return formatReplies(carried, round, { heading: (thread) => heading(thread, places[thread.handle], kind), details, noun: 'note' })
}
