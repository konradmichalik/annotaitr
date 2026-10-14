/** Visible names for the two sides of a thread. */
export const AUTHOR_LABELS = { agent: 'Agent', human: 'You' }
export const AUTHOR_AVATARS = { agent: 'AI', human: 'You' }

// Icon plus text, so a status never depends on colour alone.
export const STATUS_DISPLAY = {
  applied: { icon: '✓', label: 'applied' },
  partial: { icon: '◐', label: 'partial' },
  declined: { icon: '✕', label: 'declined' },
  deferred: { icon: '→', label: 'deferred' },
  question: { icon: '?', label: 'question' },
  none: { icon: '·', label: 'no reply' }
}

// The status of the last sent reply: a reviewer's answer reads as no reply until the agent responds, a pending one is not sent yet.
export function threadStatus(thread) {
  const last = thread.replies.findLast((r) => !r.pending)
  return last?.author === 'human' ? 'none' : (last?.status ?? 'none')
}

/** A thread carried into this round has no number of its own, it keeps the round and number it was raised with. */
export const threadRound = (thread, round) => thread.origin?.round ?? round
export const threadNumber = (thread) => thread.origin?.number ?? thread.number ?? null
// The panel lists carried threads beside this round's own, so a number from another round carries its round.
export const threadLabel = (thread, round) => (threadRound(thread, round) === round ? `${threadNumber(thread)}` : `${threadRound(thread, round)}·${threadNumber(thread)}`)
// A general comment has no number, so its title names what it is instead of "note null".
export const threadTitle = (thread, round) => (threadNumber(thread) === null
  ? `Round ${threadRound(thread, round)} · general comment`
  : `Round ${threadRound(thread, round)} · note ${threadNumber(thread)}`)

export const pendingReplies = (thread) => thread.replies.filter((r) => r.pending)
export const pendingReplyCount = (threads) => threads.reduce((sum, t) => sum + pendingReplies(t).length, 0)

export const openQuestions = (threads) => threads.filter((t) => threadStatus(t) === 'question' && pendingReplies(t).length === 0)

// A status from a hand-edited session must not crash the canvas, it reads as no reply.
export function statusDisplay(thread) {
  return STATUS_DISPLAY[threadStatus(thread)] ?? STATUS_DISPLAY.none
}

export function orphanThreads(threads) {
  return threads.filter((t) => t.anchor === 'orphan')
}

// The reviewer's note opens the list, so the thread reads top to bottom: note, the agent's answers, the reviewer's replies.
export function threadMessages(thread, round) {
  const r = threadRound(thread, round)
  const note = { id: 'note', author: 'human', text: thread.annotation.text, meta: `round ${r}` }
  const replies = thread.replies.map((reply) => ((reply.author ?? 'agent') === 'agent' ? { ...reply, meta: `after round ${r}` } : reply))
  return [note, ...replies]
}

/** The `/api/threads` body as last round state. Anything unexpected, including a failed request (null), is an empty round. */
export function readPreviousRound(body) {
  const threads = body?.data?.threads
  if (!Array.isArray(threads)) { return { round: null, threads: [] } }
  return { round: body.data.round ?? null, threads }
}
