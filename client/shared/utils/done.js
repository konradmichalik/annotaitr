import { plural } from './decision.js'

/**
 * Which done page to show: `gone` when the session ended before a decision,
 * `feedback` after Send feedback, `approved-notes` when an approval passed
 * notes or replies along, `approved` otherwise. Null while the review runs.
 */
export function doneOutcome({ decision, serverGone = false, notes = 0, replies = 0 }) {
  if (decision === 'feedback') { return 'feedback' }
  if (decision === 'approved') { return notes + replies > 0 ? 'approved-notes' : 'approved' }
  return serverGone ? 'gone' : null
}

/** "4 notes, 2 replies", leaving out what is zero; "nothing" when both are. */
export function countsLabel(notes, replies = 0) {
  const parts = [notes > 0 && plural(notes, 'note'), replies > 0 && plural(replies, 'reply', 'replies')].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : 'nothing'
}

/**
 * The rows the done page lists: numbered notes by number, the general
 * comment last. `notes` are `{ id, number, intent, text }`.
 */
function orderNotes(notes) {
  const numbered = notes.filter((note) => Number.isInteger(note.number)).sort((a, b) => a.number - b.number)
  return [...numbered, ...notes.filter((note) => !Number.isInteger(note.number))]
}

/** The first `limit` rows and what the "+ n more" line says about the rest, or null. */
export function previewNotes(notes, replies = 0, limit = 3) {
  const ordered = orderNotes(notes)
  const shown = ordered.slice(0, limit)
  const hiddenNotes = ordered.length - shown.length
  const rest = [
    hiddenNotes > 0 && `${hiddenNotes} more ${hiddenNotes === 1 ? 'note' : 'notes'}`,
    replies > 0 && plural(replies, 'reply', 'replies')
  ].filter(Boolean)
  return { shown, more: rest.length > 0 ? `+ ${rest.join(', ')}` : null }
}
