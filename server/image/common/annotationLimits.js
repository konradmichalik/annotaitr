// Mirrors client/image/src/utils/exportImport.js's own limits (client and
// server share no modules, so this is duplicated deliberately) - POST
// /api/annotations is reachable directly, bypassing the client's own import
// validator entirely, so it needs its own copy of the same bound.
export const MAX_ANNOTATIONS = 10000
export const MAX_POINTS_PER_ANNOTATION = 5000

const isPoint = (p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)

/**
 * Reject a payload carrying more annotations, or a points-geometry mark with
 * more points, than the client itself would ever produce, and a mark with a
 * malformed point, which would otherwise crash the feedback formatting.
 */
export function annotationsWithinLimits(annotations) {
  if (annotations.length > MAX_ANNOTATIONS) { return false }
  return annotations.every((annotation) => {
    const points = annotation?.geometry?.points
    return !Array.isArray(points) || (points.length <= MAX_POINTS_PER_ANNOTATION && points.every(isPoint))
  })
}

/** The `annotations` of a request body if it is within the limits, else the error to answer with. */
export function annotationsFromBody(body) {
  const annotations = body?.annotations
  if (!Array.isArray(annotations)) { return { error: 'annotations must be an array' } }
  if (!annotationsWithinLimits(annotations)) {
    return {
      error: `Too many annotations or points, or a malformed point (max ${MAX_ANNOTATIONS} annotations, ${MAX_POINTS_PER_ANNOTATION} points each)`
    }
  }
  return { annotations }
}
