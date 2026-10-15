import { serverStrokeWidth, serverHeadLength, PIN_RADIUS, BADGE_RADIUS } from './annotationStyles.js'

/**
 * Plan a full-resolution crop per note (or per group of notes close
 * together), so an agent reading a large screenshot can look at each marked
 * area without the overview being scaled down past legibility.
 */

const MIN_PADDING = 64
const MIN_CROP_WIDTH = 400
const MIN_CROP_HEIGHT = 300
const MAX_CROP_SHARE = 0.5
const MAX_CROPS = 20
const LISTED_NUMBERS = 3

function rectOfPoints(points) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

const grow = ({ x, y, width, height }, by) => ({ x: x - by, y: y - by, width: width + by * 2, height: height + by * 2 })

function markRect(annotation) {
  const { type, geometry } = annotation
  if (type === 'pin') { return { x: geometry.x, y: geometry.y, width: 0, height: 0 } }
  if (type === 'arrow') {
    const { x1, y1, x2, y2 } = geometry
    return grow(rectOfPoints([{ x: x1, y: y1 }, { x: x2, y: y2 }]), serverHeadLength(annotation))
  }
  if (type === 'freehand' || type === 'highlighter') { return rectOfPoints(geometry.points) }
  const { x, y, width, height } = geometry
  return rectOfPoints([{ x, y }, { x: x + width, y: y + height }])
}

/** The area a mark covers on the image, including its stroke and its number badge. */
export function annotationBounds(annotation) {
  const marker = annotation.type === 'pin' ? PIN_RADIUS : BADGE_RADIUS
  return grow(markRect(annotation), serverStrokeWidth(annotation) / 2 + marker)
}

/** Room around a mark, so the crop shows what it sits in. */
export function padRect(rect) {
  return grow(rect, Math.max(MIN_PADDING, Math.max(rect.width, rect.height) / 2))
}

// The length is rounded before the start is clamped, so the integer crop always ends inside the image.
function fitAxis(from, size, minSize, limit) {
  const length = Math.min(Math.round(Math.max(size, minSize)), limit)
  const centred = from + size / 2 - length / 2
  return { start: Math.round(Math.min(Math.max(centred, 0), limit - length)), length }
}

/** At least the minimum crop size, moved inside the image rather than cut at its edge, and never larger than the image. */
export function clampRect(rect, imageWidth, imageHeight) {
  const h = fitAxis(rect.x, rect.width, MIN_CROP_WIDTH, imageWidth)
  const v = fitAxis(rect.y, rect.height, MIN_CROP_HEIGHT, imageHeight)
  return { x: h.start, y: v.start, width: h.length, height: v.length }
}

const intersects = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

function union(rects) {
  return rectOfPoints(rects.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y + r.height }]))
}

/** Groups of note indexes whose padded areas overlap, directly or through another note in the group. */
export function clusterNotes(notes) {
  const padded = notes.map((note) => padRect(annotationBounds(note)))
  const parent = notes.map((_, i) => i)
  const root = (i) => (parent[i] === i ? i : root(parent[i]))
  padded.forEach((rect, i) => {
    padded.slice(0, i).forEach((other, j) => {
      if (intersects(rect, other)) { parent[root(i)] = root(j) }
    })
  })
  const groups = new Map()
  notes.forEach((_, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), i]))
  return [...groups.values()]
}

/**
 * The crops for one image as `{ rect, numbers }`, in number order. Comments
 * have no place on the image, and a crop covering most of the image would
 * show nothing the overview does not.
 */
export function planCrops(notes, numbers, imageWidth, imageHeight) {
  const placed = notes.map((note, i) => ({ note, number: numbers[i] })).filter(({ note }) => note.type !== 'comment')
  return clusterNotes(placed.map((p) => p.note))
    .map((group) => ({
      rect: clampRect(padRect(union(group.map((i) => annotationBounds(placed[i].note)))), imageWidth, imageHeight),
      numbers: group.map((i) => placed[i].number).sort((a, b) => a - b)
    }))
    .filter(({ rect }) => rect.width * rect.height <= imageWidth * imageHeight * MAX_CROP_SHARE)
    .sort((a, b) => a.numbers[0] - b.numbers[0])
    .slice(0, MAX_CROPS)
}

const pad = (number) => String(number).padStart(2, '0')

/** `crop-03-05.png` after a `prefix` such as `page-07-`; past three numbers the name lists two and `etc`. */
export function cropFileName(prefix, numbers) {
  const listed = numbers.length > LISTED_NUMBERS ? [...numbers.slice(0, 2).map(pad), 'etc'] : numbers.map(pad)
  return `${prefix}crop-${listed.join('-')}.png`
}
