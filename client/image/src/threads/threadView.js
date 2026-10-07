import { isVisibleAt } from '../video/timeline.js'

/** Visible names for the two sides of a thread. */
export const AUTHOR_LABELS = { agent: 'Agent', human: 'You' }

// Icon plus text, so a status never depends on colour alone.
export const STATUS_DISPLAY = {
  applied: { icon: '✓', label: 'applied' },
  partial: { icon: '◐', label: 'partial' },
  declined: { icon: '✕', label: 'declined' },
  deferred: { icon: '→', label: 'deferred' },
  question: { icon: '?', label: 'question' },
  none: { icon: '·', label: 'no reply' }
}

export function threadStatus(thread) {
  return thread.replies.at(-1)?.status ?? 'none'
}

// A status from a hand-edited session must not crash the canvas, it reads as no reply.
export function statusDisplay(thread) {
  return STATUS_DISPLAY[threadStatus(thread)] ?? STATUS_DISPLAY.none
}

function inView(annotation, view) {
  if (view.kind === 'video') { return isVisibleAt(annotation, view.time, view.tolerance) }
  if (view.kind === 'document') { return annotation.page === view.page }
  return true
}

// Orphans and general comments have no mark, so their popover hangs off the panel entry or the timeline tick.
export const hasMark = (thread) => thread.anchor !== 'orphan' && thread.annotation.type !== 'comment'

/** Threads to draw in the current view. Orphans have no place and general comments no geometry, so the panel lists them instead. */
export function placedThreads(threads, view) {
  return threads.filter((t) => hasMark(t) && inView(t.annotation, view))
}

export function orphanThreads(threads) {
  return threads.filter((t) => t.anchor === 'orphan')
}

export function threadPageCounts(threads) {
  const counts = new Map()
  for (const { anchor, annotation } of threads) {
    if (anchor === 'orphan' || typeof annotation.page !== 'number') { continue }
    counts.set(annotation.page, (counts.get(annotation.page) ?? 0) + 1)
  }
  return counts
}

// The server orphans video marks past the end only when it knows the duration, which only the browser can measure.
export function threadsQuery(duration) {
  return Number.isFinite(duration) ? `?duration=${duration}` : ''
}

/** The `/api/threads` body as last round state. Anything unexpected, including a failed request (null), is an empty round. */
export function readPreviousRound(body) {
  const threads = body?.data?.threads
  if (!Array.isArray(threads)) { return { round: null, threads: [] } }
  return { round: body.data.round ?? null, threads }
}
