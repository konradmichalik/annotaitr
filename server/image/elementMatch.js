/**
 * Match image-mode annotations to the elements of a captured page's DOM map
 * (server/image/domMap.js). Both live in the same pixel space: a capture
 * runs at deviceScaleFactor 1, so one screenshot pixel is one CSS pixel.
 */

import { resolveArrowStyle, serverStrokeWidth } from './annotationStyles.js'
import { CONTAINERS } from './domMap.js'

// How far a pin or arrow tip may land outside an element and still name it.
const POINT_REACH = 24
const MIN_OVERLAP = 0.25

const area = ({ width, height }) => width * height

function contains(box, p) {
  return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height
}

function distanceTo(box, p) {
  const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.width))
  const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.height))
  return Math.hypot(dx, dy)
}

function overlap(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (width <= 0 || height <= 0) { return 0 }
  const shared = width * height
  return shared / (area(a) + area(b) - shared)
}

// On a tie the later element wins: in document order that is the inner one.
function smallest(elements) {
  return elements.reduce((best, el) => (best && area(best.box) < area(el.box) ? best : el), null)
}

// A landmark encloses almost every point in its area, named or not, and so
// does a plain panel div, so they only win when nothing more specific is
// under or near the point. A div with a role or a name is a widget instead.
const isContainer = (el) => CONTAINERS.has(el.tag) || (el.tag === 'div' && !el.role && !el.name)

function nearest(elements, p) {
  const near = elements
    .map((el, order) => ({ el, order, distance: distanceTo(el.box, p) }))
    .filter(({ distance }) => distance <= POINT_REACH)
    .sort((a, b) => a.distance - b.distance || area(a.el.box) - area(b.el.box) || b.order - a.order)
  return near[0]?.el ?? null
}

function matchPoint(map, p) {
  const specific = map.filter((el) => !isContainer(el))
  const enclosing = map.filter((el) => contains(el.box, p))
  return smallest(enclosing.filter((el) => !isContainer(el))) ?? nearest(specific, p) ?? smallest(enclosing)
}

function matchRegion(map, region) {
  const scored = map
    .map((el, order) => ({ el, order, score: overlap(el.box, region) }))
    .filter(({ score }) => score >= MIN_OVERLAP)
    .sort((a, b) => b.score - a.score || area(a.el.box) - area(b.el.box) || b.order - a.order)
  if (scored.length > 0) { return scored[0].el }
  return matchPoint(map, { x: region.x + region.width / 2, y: region.y + region.height / 2 })
}

/** The rectangle a box or points-based mark covers; a highlighter stroke is widened by its own width. */
function regionOf(annotation) {
  const { type, geometry } = annotation
  if (type === 'box' || type === 'element') { return geometry }
  const xs = geometry.points.map((p) => p.x)
  const ys = geometry.points.map((p) => p.y)
  const pad = type === 'highlighter' ? serverStrokeWidth(annotation) / 2 : 0
  const x = Math.min(...xs) - pad
  const y = Math.min(...ys) - pad
  return { x, y, width: Math.max(...xs) + pad - x, height: Math.max(...ys) + pad - y }
}

function arrowEnds(annotation) {
  const { x1, y1, x2, y2 } = annotation.geometry
  const tip = { x: x2, y: y2 }
  return resolveArrowStyle(annotation.arrowStyle) === 'head' ? [tip] : [{ x: x1, y: y1 }, tip]
}

/** The element (or, for two-ended arrows, up to two elements) an annotation points at. */
export function matchAnnotation(map, annotation) {
  if (!Array.isArray(map) || map.length === 0 || !annotation?.geometry) { return [] }
  if (annotation.type === 'comment') { return [] }
  if (annotation.type === 'pin') { return [matchPoint(map, annotation.geometry)].filter(Boolean) }
  if (annotation.type === 'arrow') {
    const matches = arrowEnds(annotation).map((p) => matchPoint(map, p)).filter(Boolean)
    return [...new Set(matches)]
  }
  if (annotation.type === 'box' || annotation.type === 'element' || Array.isArray(annotation.geometry.points)) {
    return [matchRegion(map, regionOf(annotation))].filter(Boolean)
  }
  return []
}

function describeElement({ tag, role, name, media, selector }) {
  const roleTag = role && role !== tag ? `${tag}[${role}]` : tag
  // Page text is untrusted: JSON quoting escapes quotes and backslashes, and
  // dropping backticks keeps it from opening a code span in the agent's view.
  const quote = (text) => JSON.stringify(text.replace(/`/g, ''))
  const quoted = name ? ` ${quote(name)}` : ''
  const file = media ? ` (${quote(media)})` : ''
  return `${roleTag}${quoted}${file} · ${selector}`
}

/** One `Element:` line for the matched elements, or null when nothing matched. */
export function formatElementLine(elements) {
  if (!elements || elements.length === 0) { return null }
  return `Element: ${elements.map(describeElement).join(' → ')}`
}
