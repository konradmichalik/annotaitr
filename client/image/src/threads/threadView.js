import { isVisibleAt } from '../video/timeline.js'

// A pin is its own number, a second one in the badge would only repeat it. Other earlier marks are drawn without their number badge.
export const badgeShowsNumber = (thread) => thread.annotation.type !== 'pin'

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
