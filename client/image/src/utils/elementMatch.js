/**
 * Client twin of server/image/elementMatch.js (client and server share no
 * modules, so this duplication is deliberate). The server's copy decides
 * what the agent gets; this one shows the reviewer the same match while
 * drawing. test/client/image/elementMatch.test.js runs both on the same
 * cases, so a change to one that is not made to the other fails there.
 */

import { resolveArrowStyle, strokeWidthOf } from './annotationStyles.js'

const POINT_REACH = 24
const MIN_OVERLAP = 0.25
// server/image/domMap.js CONTAINERS
const CONTAINERS = new Set(['nav', 'header', 'footer', 'main', 'section', 'article', 'aside', 'form'])
// server/image/annotationStyles.js draws a highlighter 18/16 as wide as the
// client, and the server pads the match region by half of that width.
const SERVER_HIGHLIGHTER_SCALE = 18 / 16

export function serverHighlighterWidth(annotation) {
  return strokeWidthOf(annotation) * SERVER_HIGHLIGHTER_SCALE
}

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

function smallest(elements) {
  return elements.reduce((best, el) => (best && area(best.box) < area(el.box) ? best : el), null)
}

const isContainer = (el) => CONTAINERS.has(el.tag) || (el.tag === 'div' && !el.role && !el.name)

function nearest(elements, p) {
  const near = elements
    .map((el, order) => ({ el, order, distance: distanceTo(el.box, p) }))
    .filter(({ distance }) => distance <= POINT_REACH)
    .sort((a, b) => a.distance - b.distance || area(a.el.box) - area(b.el.box) || b.order - a.order)
  return near[0]?.el ?? null
}

/** The element a single point names; also what the hover outline shows. */
export function matchPoint(map, p) {
  const specific = map.filter((el) => !isContainer(el))
  const enclosing = map.filter((el) => contains(el.box, p))
  return smallest(enclosing.filter((el) => !isContainer(el))) ?? nearest(specific, p) ?? smallest(enclosing)
}

function matchRegion(map, region) {
  const scored = map
    .map((el, order) => ({ el, order, score: overlap(el.box, region) }))
    .filter(({ score }) => score >= MIN_OVERLAP)
    .sort((a, b) => b.score - a.score || area(a.el.box) - area(b.el.box)
      || isContainer(a.el) - isContainer(b.el) || b.order - a.order)
  if (scored.length > 0) { return scored[0].el }
  return matchPoint(map, { x: region.x + region.width / 2, y: region.y + region.height / 2 })
}

function regionOf(annotation) {
  const { type, geometry } = annotation
  if (type === 'box' || type === 'element') { return geometry }
  const xs = geometry.points.map((p) => p.x)
  const ys = geometry.points.map((p) => p.y)
  const pad = type === 'highlighter' ? serverHighlighterWidth(annotation) / 2 : 0
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

/** A short on-screen name: the element's own selector token, its role, name and media file. */
export function elementLabel({ tag, role, name, media, heading, selector }) {
  const own = selector.split(' ').at(-1) || tag
  const base = own.startsWith('#') ? `${tag}${own}` : own
  const roleTag = role && role !== tag ? `${base}[${role}]` : base
  return `${roleTag}${name ? ` "${name}"` : ''}${media ? ` (${media})` : ''}${heading ? ` (heading "${heading}")` : ''}`
}

/** On-screen names for matched elements, joined like the feedback's `Element:` line, or null without a match. */
export function describeElements(matches) {
  return matches.length > 0 ? matches.map(elementLabel).join(' → ') : null
}
