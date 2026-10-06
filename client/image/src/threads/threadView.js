import { isVisibleAt } from '../video/timeline.js'

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

function inView(annotation, view) {
  if (view.kind === 'video') { return isVisibleAt(annotation, view.time, view.tolerance) }
  if (view.kind === 'document') { return annotation.page === view.page }
  return true
}

/** Threads to draw in the current view. Orphans have no place and general comments no geometry, so the panel lists them instead. */
export function placedThreads(threads, view) {
  return threads.filter((t) => t.anchor !== 'orphan' && t.annotation.type !== 'comment' && inView(t.annotation, view))
}

// Orphans and general comments have no mark, so their popover hangs off the panel entry or the timeline tick.
export const hasMark = (thread) => thread.anchor !== 'orphan' && thread.annotation.type !== 'comment'

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
