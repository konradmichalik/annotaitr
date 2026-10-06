import { isPointsGeometry, MAX_POINTS_PER_ANNOTATION } from './drawing.js'
import { MAX_QUOTE_LENGTH, MAX_TEXT_RECTS } from '../document/textSelection.js'

const VALID_TYPES = new Set(['box', 'element', 'text', 'arrow', 'freehand', 'highlighter', 'pin', 'comment'])
const MAX_ANNOTATIONS = 10000

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidPoint(point) {
  return !!point && typeof point === 'object' && isFiniteNumber(point.x) && isFiniteNumber(point.y)
}

/** Validate a single annotation's geometry against the shape its `type` requires. */
const isRect = (r) => isFiniteNumber(r?.x) && isFiniteNumber(r?.y) && isFiniteNumber(r?.width) && isFiniteNumber(r?.height)

function validateGeometry(type, geometry, index) {
  // A general comment about the whole image has no geometry - it isn't drawn
  // on the canvas at all.
  if (type === 'comment') { return }
  if (!geometry || typeof geometry !== 'object') {
    throw new Error(`Annotation ${index + 1}: missing geometry.`)
  }
  if (type === 'box' || type === 'element' || type === 'text') {
    if (!isFiniteNumber(geometry.x) || !isFiniteNumber(geometry.y)
      || !isFiniteNumber(geometry.width) || !isFiniteNumber(geometry.height)) {
      throw new Error(`Annotation ${index + 1}: ${type} geometry must have numeric x/y/width/height.`)
    }
    if (type === 'text' && !(Array.isArray(geometry.rects) && geometry.rects.length > 0
      && geometry.rects.length <= MAX_TEXT_RECTS && geometry.rects.every(isRect))) {
      throw new Error(`Annotation ${index + 1}: text geometry must have 1 to ${MAX_TEXT_RECTS} rects of {x, y, width, height}.`)
    }
    return
  }
  if (type === 'arrow') {
    if (!isFiniteNumber(geometry.x1) || !isFiniteNumber(geometry.y1)
      || !isFiniteNumber(geometry.x2) || !isFiniteNumber(geometry.y2)) {
      throw new Error(`Annotation ${index + 1}: arrow geometry must have numeric x1/y1/x2/y2.`)
    }
    return
  }
  if (type === 'pin') {
    if (!isValidPoint(geometry)) {
      throw new Error(`Annotation ${index + 1}: pin geometry must have numeric x/y.`)
    }
    return
  }
  if (isPointsGeometry(type)) {
    if (!Array.isArray(geometry.points) || geometry.points.length === 0 || !geometry.points.every(isValidPoint)) {
      throw new Error(`Annotation ${index + 1}: ${type} geometry must have a non-empty points array of {x, y}.`)
    }
    if (geometry.points.length > MAX_POINTS_PER_ANNOTATION) {
      throw new Error(`Annotation ${index + 1}: ${type} has too many points (max ${MAX_POINTS_PER_ANNOTATION}).`)
    }
  }
}

/** Validate a single annotation's shape, throwing a descriptive error for the first problem found. */
function validateAnnotation(ann, index) {
  if (!ann || typeof ann !== 'object') {
    throw new Error(`Annotation ${index + 1}: must be an object.`)
  }
  if (typeof ann.id !== 'string' || ann.id.length === 0) {
    throw new Error(`Annotation ${index + 1}: id must be a non-empty string.`)
  }
  if (!VALID_TYPES.has(ann.type)) {
    throw new Error(`Annotation ${index + 1}: unknown type "${ann.type}".`)
  }
  validateGeometry(ann.type, ann.geometry, index)
  // Mirrors server/image/document/pages.js, which refuses a text selection without its words.
  if (ann.type === 'text' && !(typeof ann.quote === 'string' && ann.quote.length > 0 && ann.quote.length <= MAX_QUOTE_LENGTH)) {
    throw new Error(`Annotation ${index + 1}: a text selection needs its selected text (at most ${MAX_QUOTE_LENGTH} characters).`)
  }
  if (ann.text !== null && ann.text !== undefined && typeof ann.text !== 'string') {
    throw new Error(`Annotation ${index + 1}: text must be a string or null.`)
  }
  if (ann.color !== null && ann.color !== undefined && typeof ann.color !== 'string') {
    throw new Error(`Annotation ${index + 1}: color must be a string or null.`)
  }
  if (ann.createdAt !== undefined && !isFiniteNumber(ann.createdAt)) {
    throw new Error(`Annotation ${index + 1}: createdAt must be a number.`)
  }
  // strokeWidth feeds straight into canvas's setLineDash() (dashArrayFor), which
  // throws a DOMException for a non-finite value - unlike dashStyle/arrowStyle
  // below, this one can't just fall back gracefully at render time.
  if (ann.strokeWidth !== undefined && !isFiniteNumber(ann.strokeWidth)) {
    throw new Error(`Annotation ${index + 1}: strokeWidth must be a number.`)
  }
  // dashStyle/arrowStyle are intentionally not enum-checked here: an
  // unrecognized value already falls back gracefully at render time
  // (dashArrayFor treats anything but 'dashed'/'dotted' as solid;
  // resolveArrowStyle treats anything but the four known values as 'head') -
  // exactly so that an older export with a since-removed style value keeps
  // importing instead of being rejected. Only the type is checked, so a
  // non-string can't reach string-only APIs (e.g. array indexing) downstream.
  if (ann.dashStyle !== undefined && typeof ann.dashStyle !== 'string') {
    throw new Error(`Annotation ${index + 1}: dashStyle must be a string.`)
  }
  if (ann.arrowStyle !== undefined && typeof ann.arrowStyle !== 'string') {
    throw new Error(`Annotation ${index + 1}: arrowStyle must be a string.`)
  }
  validateTimes(ann, index)
  validatePage(ann, index)
}

function isValidTime(value) {
  return isFiniteNumber(value) && value >= 0
}

/** time/endTime only exist on annotations of a video or GIF. */
function validateTimes(ann, index) {
  if (ann.time !== undefined && !isValidTime(ann.time)) {
    throw new Error(`Annotation ${index + 1}: time must be a number >= 0.`)
  }
  if (ann.endTime !== undefined && (!isValidTime(ann.endTime) || ann.time === undefined || ann.endTime <= ann.time)) {
    throw new Error(`Annotation ${index + 1}: endTime must be a number after time.`)
  }
}

/** page only exists on annotations of a PDF. */
function validatePage(ann, index) {
  if (ann.page !== undefined && ann.page !== null && !(Number.isInteger(ann.page) && ann.page >= 1)) {
    throw new Error(`Annotation ${index + 1}: page must be a whole number >= 1.`)
  }
}

export function serializeAnnotations(annotations) {
  return JSON.stringify(annotations, null, 2)
}

export function parseAnnotationsJson(json) {
  let parsed
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid annotations JSON: could not parse the file.')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid annotations JSON: top-level value must be an array.')
  }
  if (parsed.length > MAX_ANNOTATIONS) {
    throw new Error(`Too many annotations (max ${MAX_ANNOTATIONS}).`)
  }
  parsed.forEach((ann, index) => validateAnnotation(ann, index))
  return parsed
}
