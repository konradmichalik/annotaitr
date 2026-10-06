import { strokeWidthOf, resolveArrowStyle, DEFAULT_STROKE_WIDTH } from './annotationStyles.js'

// A freehand/highlighter mark's geometry.points array is capped at this length,
// both while it's being drawn (ImageCanvas.jsx's point collector) and on import
// (exportImport.js) - an unbounded array bogs down validation and, worse,
// rendering (one SVG polyline built from every point). server/image/routes.js
// enforces the same number on POST /api/annotations (duplicated there - client
// and server share no modules, same as annotationStyles.js's own constants).
export const MAX_POINTS_PER_ANNOTATION = 5000

export function clampPoint(point, width, height) {
  return {
    x: Math.min(Math.max(point.x, 0), width),
    y: Math.min(Math.max(point.y, 0), height)
  }
}

export function distance(p1, p2) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y)
}

export function boxFromPoints(p1, p2) {
  const x = Math.min(p1.x, p2.x)
  const y = Math.min(p1.y, p2.y)
  return { x, y, width: Math.abs(p2.x - p1.x), height: Math.abs(p2.y - p1.y) }
}

/**
 * A single representative point for an annotation, used both to anchor an
 * edit popover and to decide where a scroll-into-view should center.
 */
// A selected page element covers the same rectangle a drawn box does, and a
// text selection's geometry is the box around all of its lines.
const isBoxLike = (type) => type === 'box' || type === 'element' || type === 'text'

export function annotationCentroid(annotation) {
  const { type, geometry } = annotation
  if (type === 'pin') { return { x: geometry.x, y: geometry.y } }
  if (isBoxLike(type)) { return { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 } }
  if (type === 'arrow') { return { x: (geometry.x1 + geometry.x2) / 2, y: (geometry.y1 + geometry.y2) / 2 } }
  const points = geometry.points
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}

/**
 * A point just below an annotation's bounding shape, used to anchor the
 * comment popover so it opens under the shape instead of overlapping it
 * (unlike the raw click/drag point, which can land anywhere on the shape).
 */
export function annotationBottomAnchor(annotation) {
  const { type, geometry } = annotation
  if (type === 'pin') { return { x: geometry.x, y: geometry.y + 18 } }
  if (isBoxLike(type)) { return { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height } }
  if (type === 'arrow') {
    return { x: (geometry.x1 + geometry.x2) / 2, y: Math.max(geometry.y1, geometry.y2) }
  }
  const points = geometry.points
  const avgX = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const maxY = Math.max(...points.map((p) => p.y))
  return { x: avgX, y: maxY }
}

/**
 * The top-center point of an annotation's bounding shape, used to anchor a
 * floating Remove/Edit toolbar above it once it's selected.
 */
export function annotationTopAnchor(annotation) {
  const { type, geometry } = annotation
  if (type === 'pin') { return { x: geometry.x, y: geometry.y - 14 } }
  if (isBoxLike(type)) { return { x: geometry.x + geometry.width / 2, y: geometry.y } }
  if (type === 'arrow') {
    return { x: (geometry.x1 + geometry.x2) / 2, y: Math.min(geometry.y1, geometry.y2) }
  }
  const bounds = freehandBounds(geometry.points)
  return { x: bounds.x + bounds.width / 2, y: bounds.y }
}

/** Shift every coordinate in an annotation's geometry by (dx, dy). */
export function translateGeometry(type, geometry, dx, dy) {
  if (type === 'pin') { return { x: geometry.x + dx, y: geometry.y + dy } }
  if (type === 'box') { return { ...geometry, x: geometry.x + dx, y: geometry.y + dy } }
  if (type === 'arrow') {
    return { x1: geometry.x1 + dx, y1: geometry.y1 + dy, x2: geometry.x2 + dx, y2: geometry.y2 + dy }
  }
  return { points: geometry.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
}

/** Whether a type's geometry is `{points: [...]}`, shared by freehand and highlighter marks. */
export function isPointsGeometry(type) {
  return type === 'freehand' || type === 'highlighter'
}

/** The axis-aligned bounding box of a freehand/highlighter mark's points, for its resize handles. */
export function freehandBounds(points) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) { return distance(p, a) }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}

export const HIGHLIGHTER_OPACITY = 0.4

const LINE_HIT_TOLERANCE = 8
const PIN_HIT_RADIUS = 16

/**
 * Click-to-select tolerance for a line-like shape: never narrower than the
 * global minimum (so a thin stroke is never harder to hit than any other
 * annotation), wider for a thick stroke so the whole visible band selects.
 */
function hitTolerance(annotation) {
  return Math.max(LINE_HIT_TOLERANCE, strokeWidthOf(annotation) / 2 + 2)
}

/** Whether `point` falls on/inside `annotation`, for click-to-select hit-testing. */
const inRect = (point, r) => point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height

export function hitTestAnnotation(point, annotation) {
  const { type, geometry } = annotation
  // Only the selected lines, not the whole box around them.
  if (type === 'text') { return geometry.rects.some((rect) => inRect(point, rect)) }
  if (isBoxLike(type)) {
    return point.x >= geometry.x && point.x <= geometry.x + geometry.width
      && point.y >= geometry.y && point.y <= geometry.y + geometry.height
  }
  if (type === 'arrow') {
    const tolerance = hitTolerance(annotation)
    const onShaft = distanceToSegment(point, { x: geometry.x1, y: geometry.y1 }, { x: geometry.x2, y: geometry.y2 }) <= tolerance
    if (onShaft || resolveArrowStyle(annotation.arrowStyle) !== 'dimension') { return onShaft }
    // A dimension-style arrow also renders two perpendicular ticks, which
    // can extend past the shaft's own tolerance for a thick arrow.
    const ticks = dimensionCapLines(geometry, dimensionTickLengthFor(annotation))
    return !!ticks && ticks.some((tick) =>
      distanceToSegment(point, { x: tick.x1, y: tick.y1 }, { x: tick.x2, y: tick.y2 }) <= tolerance
    )
  }
  if (type === 'pin') {
    return distance(point, geometry) <= PIN_HIT_RADIUS
  }
  // A general comment (no geometry, not drawn on the canvas at all) or any
  // other type with no points array is never hit-testable.
  if (!isPointsGeometry(type) || !geometry?.points) { return false }
  const points = geometry.points
  const tolerance = hitTolerance(annotation)
  for (let i = 0; i < points.length - 1; i++) {
    if (distanceToSegment(point, points[i], points[i + 1]) <= tolerance) { return true }
  }
  return false
}

/** Topmost (last-drawn) annotation under `point`, or null. */
export function findAnnotationAt(point, annotations) {
  for (let i = annotations.length - 1; i >= 0; i--) {
    if (hitTestAnnotation(point, annotations[i])) { return annotations[i] }
  }
  return null
}

/**
 * Recompute a box/arrow/freehand/highlighter's geometry when one of its
 * resize handles is dragged to `point`. `handle` is one of 'nw'/'ne'/'sw'/'se'
 * for a box or a points-based mark's bounding box (the opposite corner stays
 * anchored), or 'start'/'end' for an arrow (the other endpoint stays anchored).
 */
export function resizeGeometry(type, geometry, handle, point) {
  if (type === 'box') {
    const anchors = {
      nw: { x: geometry.x + geometry.width, y: geometry.y + geometry.height },
      ne: { x: geometry.x, y: geometry.y + geometry.height },
      sw: { x: geometry.x + geometry.width, y: geometry.y },
      se: { x: geometry.x, y: geometry.y }
    }
    return boxFromPoints(anchors[handle], point)
  }
  if (type === 'arrow') {
    return handle === 'start'
      ? { x1: point.x, y1: point.y, x2: geometry.x2, y2: geometry.y2 }
      : { x1: geometry.x1, y1: geometry.y1, x2: point.x, y2: point.y }
  }
  if (isPointsGeometry(type)) {
    const bounds = freehandBounds(geometry.points)
    const minX = bounds.x
    const minY = bounds.y
    const maxX = bounds.x + bounds.width
    const maxY = bounds.y + bounds.height

    // Each handle's own original position, and which handle sits diagonally
    // opposite it (that corner is the fixed anchor for this drag).
    const corners = { nw: { x: minX, y: minY }, ne: { x: maxX, y: minY }, sw: { x: minX, y: maxY }, se: { x: maxX, y: maxY } }
    const opposite = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' }
    const anchor = corners[opposite[handle]]
    const original = corners[handle]

    const spanX = original.x - anchor.x
    const spanY = original.y - anchor.y
    const scaleX = spanX === 0 ? 1 : (point.x - anchor.x) / spanX
    const scaleY = spanY === 0 ? 1 : (point.y - anchor.y) / spanY

    return {
      points: geometry.points.map((p) => ({
        x: anchor.x + (p.x - anchor.x) * scaleX,
        y: anchor.y + (p.y - anchor.y) * scaleY
      }))
    }
  }
  return geometry
}

/** Length, in image-space units, of each perpendicular tick on a dimension-style arrow. */
export const DIMENSION_TICK_LENGTH = 14

/**
 * The two perpendicular tick segments for a dimension-line-style arrow, one
 * centered at each endpoint of `geometry`. Returns null for a zero-length
 * arrow (a click with no drag), which has no direction to be perpendicular to.
 */
export function dimensionCapLines(geometry, tickLength = DIMENSION_TICK_LENGTH) {
  const { x1, y1, x2, y2 } = geometry
  const len = Math.hypot(x2 - x1, y2 - y1)
  if (len === 0) { return null }
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const px = -uy
  const py = ux
  const half = tickLength / 2
  return [
    { x1: x1 - px * half, y1: y1 - py * half, x2: x1 + px * half, y2: y1 + py * half },
    { x1: x2 - px * half, y1: y2 - py * half, x2: x2 + px * half, y2: y2 + py * half }
  ]
}

/**
 * A dimension-style arrow's tick length, scaled from its own stroke width
 * (preserving DIMENSION_TICK_LENGTH at the default width). Shared by
 * ArrowShape's rendering and hitTestAnnotation's hit-testing, so the visible
 * tick length and the clickable tick length can never drift apart.
 */
export function dimensionTickLengthFor(annotation) {
  return (strokeWidthOf(annotation) / DEFAULT_STROKE_WIDTH) * DIMENSION_TICK_LENGTH
}
