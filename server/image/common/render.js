import { createCanvas, loadImage } from '@napi-rs/canvas'
import {
  resolveArrowStyle, serverStrokeWidth, serverDashArray, serverHeadLength, serverDimensionTickLength
} from './annotationStyles.js'
import { isNumbered, intentOf, intentWord } from '../../core/notes.js'

const PIN_RADIUS = 14
const BADGE_RADIUS = 11
// The intent mark colours and the number on them, from client/shared/styles/tokens.css
// (client and server share no modules, so this duplication is deliberate). Marks keep
// these colours in both themes, so the rendered image matches the canvas.
const INTENT_MARKS = { change: '#c04a00', add: '#e69f00', remove: '#a8457e', question: '#0072b2' }
const ON_MARK = { add: '#16181d' }
const ON_MARK_DEFAULT = '#fff'
const MARK_HALO = 'rgba(255, 255, 255, 0.6)'
const HIGHLIGHTER_OPACITY = 0.4

const LEGEND_PADDING = 14
const LEGEND_LINE_HEIGHT = 18
const LEGEND_GAP = 8
const LEGEND_FONT_SIZE = 13
const LEGEND_BG = '#20242c'
const LEGEND_HEADER_COLOR = '#f5f6fa'
const LEGEND_TEXT_COLOR = '#b8bfcc'

const TYPE_LABELS = { box: 'Box', element: 'Element', text: 'Text', arrow: 'Arrow', freehand: 'Freehand', highlighter: 'Highlight', pin: 'Pin', comment: 'General comment' }

function drawArrowhead(ctx, x1, y1, x2, y2, color, headLength, lineWidth) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(
    x2 - headLength * Math.cos(angle - Math.PI / 6),
    y2 - headLength * Math.sin(angle - Math.PI / 6)
  )
  ctx.moveTo(x2, y2)
  ctx.lineTo(
    x2 - headLength * Math.cos(angle + Math.PI / 6),
    y2 - headLength * Math.sin(angle + Math.PI / 6)
  )
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  // A head must stay solid even when the shaft it's attached to is dashed.
  ctx.setLineDash([])
  ctx.stroke()
}

/** Perpendicular tick marks at both ends of a dimension-style arrow, the canvas twin of client drawing.js's dimensionCapLines. */
function drawDimensionCaps(ctx, x1, y1, x2, y2, color, tickLength, lineWidth) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  if (len === 0) { return }
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const px = -uy
  const py = ux
  const half = tickLength / 2
  ctx.beginPath()
  ctx.moveTo(x1 - px * half, y1 - py * half)
  ctx.lineTo(x1 + px * half, y1 + py * half)
  ctx.moveTo(x2 - px * half, y2 - py * half)
  ctx.lineTo(x2 + px * half, y2 + py * half)
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  // Ticks must stay solid even when the shaft they're attached to is dashed.
  ctx.setLineDash([])
  ctx.stroke()
}

const markOf = (intent) => INTENT_MARKS[intent] ?? INTENT_MARKS.change

/** The number on its intent's colour with a soft light halo, as the canvas draws it. */
function drawNumber(ctx, x, y, number, intent, radius, fontSize) {
  if (number === undefined || number === null) { return }
  ctx.save()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = markOf(intent)
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = MARK_HALO
  ctx.stroke()
  ctx.fillStyle = ON_MARK[intent] ?? ON_MARK_DEFAULT
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(number), x, y)
  ctx.restore()
}

function drawBadge(ctx, x, y, number, intent) {
  drawNumber(ctx, x, y, number, intent, BADGE_RADIUS, 12)
}

function drawBox(ctx, geometry, number, intent) {
  const { x, y, width, height } = geometry
  ctx.strokeRect(x, y, width, height)
  drawBadge(ctx, x, y, number, intent)
}

// The light fill tells a selected page element apart from a hand-drawn box.
const ELEMENT_FILL_ALPHA = 0.15

function drawElement(ctx, geometry, number, intent) {
  const { x, y, width, height } = geometry
  ctx.save()
  ctx.globalAlpha = ELEMENT_FILL_ALPHA
  ctx.fillRect(x, y, width, height)
  ctx.restore()
  drawBox(ctx, geometry, number, intent)
}

// A text selection is painted like a marker over its lines, so the words
// stay readable underneath.
const TEXT_FILL_ALPHA = 0.3

function drawSelectedText(ctx, geometry, number, intent) {
  ctx.save()
  ctx.globalAlpha = TEXT_FILL_ALPHA
  for (const { x, y, width, height } of geometry.rects) { ctx.fillRect(x, y, width, height) }
  ctx.restore()
  const [first] = geometry.rects
  drawBadge(ctx, first.x, first.y, number, intent)
}

function drawArrow(ctx, annotation, number, color, intent) {
  const { x1, y1, x2, y2 } = annotation.geometry
  const style = resolveArrowStyle(annotation.arrowStyle)
  const lineWidth = serverStrokeWidth(annotation)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  if (style === 'dimension') {
    drawDimensionCaps(ctx, x1, y1, x2, y2, color, serverDimensionTickLength(annotation), lineWidth)
  } else if (style === 'double') {
    const headLength = serverHeadLength(annotation)
    drawArrowhead(ctx, x1, y1, x2, y2, color, headLength, lineWidth)
    drawArrowhead(ctx, x2, y2, x1, y1, color, headLength, lineWidth)
  } else if (style === 'head') {
    drawArrowhead(ctx, x1, y1, x2, y2, color, serverHeadLength(annotation), lineWidth)
  }
  drawBadge(ctx, x1, y1, number, intent)
}

function strokePoints(ctx, points) {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const point of points.slice(1)) {
    ctx.lineTo(point.x, point.y)
  }
  ctx.stroke()
}

function drawFreehand(ctx, geometry, number, intent) {
  const points = geometry.points
  if (points.length < 2) { return }
  strokePoints(ctx, points)
  drawBadge(ctx, points[0].x, points[0].y, number, intent)
}

function drawHighlighter(ctx, geometry, number, intent) {
  const points = geometry.points
  if (points.length < 2) { return }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = HIGHLIGHTER_OPACITY
  // ctx.lineWidth is already the (highlighter-scaled) resolved width, set
  // unconditionally by drawAnnotation's dispatch before this runs.
  strokePoints(ctx, points)
  ctx.restore()
  drawBadge(ctx, points[0].x, points[0].y, number, intent)
}

function drawPin(ctx, geometry, number, intent) {
  drawNumber(ctx, geometry.x, geometry.y, number ?? '', intent, PIN_RADIUS, 16)
}

/** The colour a shape is drawn in: its ink when it has one, its intent's mark colour otherwise. */
const shapeColor = (annotation) => annotation.color || markOf(intentOf(annotation))

function drawAnnotation(ctx, annotation, number) {
  const color = shapeColor(annotation)
  const intent = intentOf(annotation)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  // Set unconditionally (never only inside a branch) so neither value can
  // leak from one annotation into the next: each call starts from a clean,
  // fully-specified state instead of relying on a previous iteration having
  // reset it, which is the same class of bug the highlighter's
  // save()/restore() around globalAlpha already guards against.
  ctx.lineWidth = serverStrokeWidth(annotation)
  ctx.setLineDash(serverDashArray(annotation))

  if (annotation.type === 'box') { drawBox(ctx, annotation.geometry, number, intent) }
  else if (annotation.type === 'element') { drawElement(ctx, annotation.geometry, number, intent) }
  else if (annotation.type === 'text') { drawSelectedText(ctx, annotation.geometry, number, intent) }
  else if (annotation.type === 'arrow') { drawArrow(ctx, annotation, number, color, intent) }
  else if (annotation.type === 'freehand') { drawFreehand(ctx, annotation.geometry, number, intent) }
  else if (annotation.type === 'highlighter') { drawHighlighter(ctx, annotation.geometry, number, intent) }
  else if (annotation.type === 'pin') { drawPin(ctx, annotation.geometry, number, intent) }
}

/** Greedy word-wrap of `text` to fit within `maxWidth`, using `ctx`'s current font. */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) { return [''] }
  const lines = []
  let current = words[0]
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`
    if (ctx.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  lines.push(current)
  return lines
}

/** A comment pinned to a moment, a span or a page is not about the whole image. */
function typeLabel(annotation) {
  if (annotation.type === 'comment' && Number.isInteger(annotation.page)) { return 'Page comment' }
  if (annotation.type === 'comment' && typeof annotation.time === 'number') {
    return typeof annotation.endTime === 'number' ? 'Span comment' : 'Comment'
  }
  return TYPE_LABELS[annotation.type] || annotation.type
}

/** "3. Question · Pin", as the feedback text heads the same note; a general comment has neither number nor intent. */
function legendLabel(annotation, number) {
  if (!isNumbered(annotation)) { return typeLabel(annotation) }
  return `${number}. ${intentWord(intentOf(annotation))} · ${typeLabel(annotation)}`
}

function buildLegendEntries(ctx, annotations, numbers, maxWidth) {
  ctx.font = `${LEGEND_FONT_SIZE}px sans-serif`
  return annotations.map((annotation, index) => ({
    label: legendLabel(annotation, numbers[index]),
    color: markOf(intentOf(annotation)),
    lines: wrapText(ctx, annotation.text?.trim() || '(no comment)', maxWidth)
  }))
}

/**
 * Render `annotations` onto a copy of the source image (shapes plus a small
 * numbered badge per shape), and append a text legend below the image
 * listing each annotation's comment. The legend keeps the comments attached
 * to the same file as the markup instead of only existing in the separate
 * feedback text — a viewer of just this image still sees what was said.
 * `numbers` are the labels drawn per annotation: a recording numbers across
 * all of its frames, so one frame's annotations need not start at 1.
 */
export async function flattenAnnotations(imageBuffer, annotations, numbers = annotations.map((a, index) => a.number ?? index + 1)) {
  const image = await loadImage(imageBuffer)

  // A throwaway context to measure legend text before the final canvas
  // (whose height depends on the legend) can be created.
  const measureCtx = createCanvas(1, 1).getContext('2d')
  const legendMaxWidth = image.width - LEGEND_PADDING * 2 - 22
  const entries = annotations.length > 0 ? buildLegendEntries(measureCtx, annotations, numbers, legendMaxWidth) : []

  const totalLines = entries.reduce((sum, entry) => sum + 1 + entry.lines.length, 0)
  const legendHeight = entries.length === 0
    ? 0
    : LEGEND_PADDING * 2 + totalLines * LEGEND_LINE_HEIGHT + (entries.length - 1) * LEGEND_GAP

  const canvas = createCanvas(image.width, image.height + legendHeight)
  const ctx = canvas.getContext('2d')

  ctx.drawImage(image, 0, 0)
  annotations.forEach((annotation, index) => drawAnnotation(ctx, annotation, numbers[index]))

  if (legendHeight > 0) {
    ctx.fillStyle = LEGEND_BG
    ctx.fillRect(0, image.height, image.width, legendHeight)
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'

    let y = image.height + LEGEND_PADDING
    entries.forEach((entry, i) => {
      ctx.beginPath()
      ctx.arc(LEGEND_PADDING + 5, y + LEGEND_LINE_HEIGHT / 2, 5, 0, Math.PI * 2)
      ctx.fillStyle = entry.color
      ctx.fill()

      ctx.font = `bold ${LEGEND_FONT_SIZE}px sans-serif`
      ctx.fillStyle = LEGEND_HEADER_COLOR
      ctx.fillText(entry.label, LEGEND_PADDING + 18, y)
      y += LEGEND_LINE_HEIGHT

      ctx.font = `${LEGEND_FONT_SIZE}px sans-serif`
      ctx.fillStyle = LEGEND_TEXT_COLOR
      for (const line of entry.lines) {
        ctx.fillText(line, LEGEND_PADDING + 18, y)
        y += LEGEND_LINE_HEIGHT
      }

      if (i < entries.length - 1) { y += LEGEND_GAP }
    })
  }

  return canvas.toBuffer('image/png')
}

export const CONTACT_SHEET_GAP = 8
export const CONTACT_SHEET_LABEL_HEIGHT = 22
const CONTACT_SHEET_FONT_SIZE = 13

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Width and height from a PNG's IHDR chunk, or null when the buffer is not a PNG. */
export function pngSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) { return null }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE) || buffer.toString('ascii', 12, 16) !== 'IHDR') { return null }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

async function tileSize(buffer) {
  const size = pngSize(buffer)
  if (size) { return size }
  const image = await loadImage(buffer)
  return { width: image.width, height: image.height }
}

/**
 * Lay frames or pages out as a labelled grid (a strip across a span, an
 * overview of a recording or of a document's annotated pages), so the agent
 * sees a sequence in one image instead of having to open every file.
 *
 * Every cell has the width of the widest tile (at most `tileWidth`, tiles
 * are never upscaled) and the height of the tallest aspect ratio, and each
 * tile is fitted and centred in it. Frames of one recording share a size, so
 * they fill their cells exactly; a document mixing portrait and landscape
 * pages keeps every page undistorted.
 *
 * @param {{ buffer: Buffer, label: string }[]} tiles
 * @param {{ columns: number, tileWidth: number }} layout
 */
export async function composeContactSheet(tiles, { columns, tileWidth }) {
  const sizes = await Promise.all(tiles.map((tile) => tileSize(tile.buffer)))
  const width = Math.min(tileWidth, Math.max(...sizes.map((s) => s.width)))
  const height = Math.round(width * Math.max(...sizes.map((s) => s.height / s.width)))
  const cellHeight = height + CONTACT_SHEET_LABEL_HEIGHT
  const cols = Math.min(columns, tiles.length)
  const rows = Math.ceil(tiles.length / cols)

  const canvas = createCanvas(
    cols * width + (cols + 1) * CONTACT_SHEET_GAP,
    rows * cellHeight + (rows + 1) * CONTACT_SHEET_GAP
  )
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = LEGEND_BG
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.font = `${CONTACT_SHEET_FONT_SIZE}px sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  // Decoded one at a time: a full-size frame can take hundreds of megabytes.
  for (const [index, tile] of tiles.entries()) {
    const image = await loadImage(tile.buffer)
    const scale = Math.min(width / image.width, height / image.height, 1)
    const drawWidth = Math.round(image.width * scale)
    const drawHeight = Math.round(image.height * scale)
    const x = CONTACT_SHEET_GAP + (index % cols) * (width + CONTACT_SHEET_GAP)
    const y = CONTACT_SHEET_GAP + Math.floor(index / cols) * (cellHeight + CONTACT_SHEET_GAP)
    ctx.drawImage(image, x + Math.round((width - drawWidth) / 2), y + Math.round((height - drawHeight) / 2), drawWidth, drawHeight)
    ctx.fillStyle = LEGEND_HEADER_COLOR
    ctx.fillText(tile.label, x + 4, y + height + CONTACT_SHEET_LABEL_HEIGHT / 2)
  }

  return canvas.toBuffer('image/png')
}
