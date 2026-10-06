/**
 * Decide where last round's marks show up in this round. Only an unchanged
 * target places them exactly; anything else keeps them at their old place as
 * a ghost the reviewer can judge, or lists them as orphans when that place
 * no longer exists. No relocation: false precision is worse than a ghost.
 */

const STILL_KINDS = new Set(['file', 'url', 'clipboard'])

function pointsOf(geometry) {
  if (Array.isArray(geometry.points)) { return geometry.points }
  if (Number.isFinite(geometry.x1)) { return [{ x: geometry.x1, y: geometry.y1 }, { x: geometry.x2, y: geometry.y2 }] }
  if (Number.isFinite(geometry.width)) {
    return [{ x: geometry.x, y: geometry.y }, { x: geometry.x + geometry.width, y: geometry.y + geometry.height }]
  }
  return [{ x: geometry.x, y: geometry.y }]
}

function boundsOf(geometry) {
  const points = geometry ? pointsOf(geometry) : []
  if (points.length === 0 || !points.every((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))) { return null }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
}

function orphanReason(annotation, current) {
  if (current.kind === 'document' && typeof annotation.page === 'number' && !current.pages.includes(annotation.page)) {
    return `Page ${annotation.page} is not part of this review`
  }
  if (current.kind === 'video' && Number.isFinite(current.duration) && annotation.time > current.duration) {
    return 'The mark is past the end of the recording'
  }
  if (!STILL_KINDS.has(current.kind)) { return null }
  const bounds = boundsOf(annotation.geometry)
  if (!bounds) { return 'The mark could not be read from the last round' }
  const outside = bounds.left >= current.width || bounds.top >= current.height || bounds.right <= 0 || bounds.bottom <= 0
  return outside ? 'The mark lies outside the current image' : null
}

function anchorOf(annotation, unchanged, round, current) {
  if (annotation.type === 'comment') { return { anchor: 'exact', reason: null } }
  const orphan = orphanReason(annotation, current)
  if (orphan) { return { anchor: 'orphan', reason: orphan } }
  if (unchanged) { return { anchor: 'exact', reason: null } }
  const what = current.kind === 'url' ? 'The page was captured again' : 'The target changed'
  return { anchor: 'ghost', reason: `${what} since round ${round}, the mark shows where it was then` }
}

export function anchorThreads(previous, current) {
  if (!previous) { return [] }
  const unchanged = current.kind !== 'url' && Boolean(previous.fingerprint) && previous.fingerprint === current.fingerprint
  return previous.threads.map((thread) => ({ ...thread, ...anchorOf(thread.annotation, unchanged, previous.round, current) }))
}
