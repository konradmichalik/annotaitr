/**
 * The decision a reviewer submits, shared by both clients. `feedback` asks for
 * changes, `approve-notes` approves and passes the notes along as context,
 * `approve` approves and discards the notes.
 */

export const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

/** The split button's main action: Approve while nothing would be sent, Send feedback otherwise. */
export function primaryAction(itemCount) {
  return itemCount > 0
    ? { choice: 'feedback', label: 'Send feedback', count: itemCount }
    : { choice: 'approve', label: 'Approve', count: 0 }
}

export function defaultChoice({ notes, replies }) {
  return primaryAction(notes + replies).choice
}

function feedbackDescription({ notes, replies, breakdown }) {
  if (notes > 0) { return `Apply ${plural(notes, 'note')}.${breakdown ? ` ${breakdown}.` : ''}` }
  if (replies > 0) { return `Send ${plural(replies, 'reply', 'replies')}, no new notes.` }
  return 'Add a note first.'
}

function approveDescription({ notes, replies }) {
  if (notes > 0) { return 'Discard the notes and approve without changes.' }
  return replies > 0 ? 'Approve without changes. Your replies still go out.' : 'Approve without changes.'
}

export function decisionOptions(counts) {
  const empty = counts.notes + counts.replies === 0
  return [
    { value: 'feedback', label: 'Send feedback', description: feedbackDescription(counts), disabled: empty },
    { value: 'approve-notes', label: 'Approve with notes', description: 'Ship as is. The notes are context, not change requests.', disabled: empty },
    { value: 'approve', label: 'Approve', description: approveDescription(counts), disabled: false }
  ]
}

export function submitLabel(choice, { notes, replies }) {
  if (choice === 'feedback') {
    return notes > 0 ? `Send ${plural(notes, 'note')}` : `Send ${plural(replies, 'reply', 'replies')}`
  }
  return choice === 'approve-notes' ? 'Approve with notes' : 'Approve'
}

export function needsDiscardConfirm(choice, notes) {
  return choice === 'approve' && notes > 0
}

/** "2 pins, 1 box": one count per type, in order of first appearance. `nouns` maps a type to [singular, plural]. */
export function describeBreakdown(types, nouns) {
  const counts = new Map()
  for (const type of types) {
    const key = nouns[type] ? type : null
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].map(([key, count]) => {
    const [one, many] = nouns[key] ?? ['note']
    return plural(count, one, many)
  }).join(', ')
}

/**
 * The summary for the agent is the general comment: it rewrites the existing one,
 * adds one when there is none, and removes it when the summary is cleared.
 */
export function applySummary(annotations, summary, { isGeneral, create }) {
  const text = summary.trim()
  const existing = annotations.find(isGeneral)
  if (existing) {
    if (!text) { return annotations.filter((a) => a !== existing) }
    return annotations.map((a) => (a === existing ? { ...a, text } : a))
  }
  return text ? [...annotations, create(text)] : annotations
}
