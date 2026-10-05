import { createCanvas, loadImage } from '@napi-rs/canvas'
import {
  resolveArrowStyle, serverStrokeWidth, serverDashArray, serverHeadLength, serverDimensionTickLength
} from './annotationStyles.js'

const PIN_RADIUS = 14
const BADGE_RADIUS = 11
// Matches ANNOTATION_COLORS[0] in client/image/src/utils/annotationColors.js
// (client and server share no modules, so this duplication is deliberate).
const DEFAULT_COLOR = '#bf616a'
const HIGHLIGHTER_OPACITY = 0.4

const LEGEND_PADDING = 14
const LEGEND_LINE_HEIGHT = 18
const LEGEND_GAP = 8
const LEGEND_FONT_SIZE = 13
const LEGEND_BG = '#20242c'
const LEGEND_HEADER_COLOR = '#f5f6fa'
const LEGEND_TEXT_COLOR = '#b8bfcc'

const TYPE_LABELS = { box: 'Box', element: 'Element', arrow: 'Arrow', freehand: 'Freehand', highlighter: 'Highlight', pin: 'Pin', comment: 'General comment' }

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

function drawBadge(ctx, x, y, number, color) {
  ctx.beginPath()
  ctx.arc(x, y, BADGE_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(number), x, y)
}

function drawBox(ctx, geometry, number, color) {
  const { x, y, width, height } = geometry
  ctx.strokeRect(x, y, width, height)
  drawBadge(ctx, x, y, number, color)
}

// The light fill tells a selected page element apart from a hand-drawn box.
const ELEMENT_FILL_ALPHA = 0.15

function drawElement(ctx, geometry, number, color) {
  const { x, y, width, height } = geometry
  ctx.save()
  ctx.globalAlpha = ELEMENT_FILL_ALPHA
  ctx.fillRect(x, y, width, height)
  ctx.restore()
  drawBox(ctx, geometry, number, color)
}

function drawArrow(ctx, annotation, number, color) {
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
  drawBadge(ctx, x1, y1, number, color)
}

function strokePoints(ctx, points) {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const point of points.slice(1)) {
    ctx.lineTo(point.x, point.y)
  }
  ctx.stroke()
}

function drawFreehand(ctx, geometry, number, color) {
  const points = geometry.points
  if (points.length < 2) { return }
  strokePoints(ctx, points)
  drawBadge(ctx, points[0].x, points[0].y, number, color)
}

function drawHighlighter(ctx, geometry, number, color) {
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
  drawBadge(ctx, points[0].x, points[0].y, number, color)
}

function drawPin(ctx, geometry, number) {
  const { x, y } = geometry
  ctx.beginPath()
  ctx.arc(x, y, PIN_RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(number), x, y)
}

function drawAnnotation(ctx, annotation, number) {
  const color = annotation.color || DEFAULT_COLOR
  ctx.strokeStyle = color
  ctx.fillStyle = color
  // Set unconditionally (never only inside a branch) so neither value can
  // leak from one annotation into the next: each call starts from a clean,
  // fully-specified state instead of relying on a previous iteration having
  // reset it, which is the same class of bug the highlighter's
  // save()/restore() around globalAlpha already guards against.
  ctx.lineWidth = serverStrokeWidth(annotation)
  ctx.setLineDash(serverDashArray(annotation))

  if (annotation.type === 'box') { drawBox(ctx, annotation.geometry, number, color) }
  else if (annotation.type === 'element') { drawElement(ctx, annotation.geometry, number, color) }
  else if (annotation.type === 'arrow') { drawArrow(ctx, annotation, number, color) }
  else if (annotation.type === 'freehand') { drawFreehand(ctx, annotation.geometry, number, color) }
  else if (annotation.type === 'highlighter') { drawHighlighter(ctx, annotation.geometry, number, color) }
  else if (annotation.type === 'pin') { drawPin(ctx, annotation.geometry, number) }
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

/** A comment pinned to a moment or span of a recording is not about the whole image. */
function legendLabel(annotation) {
  if (annotation.type === 'comment' && typeof annotation.time === 'number') {
    return typeof annotation.endTime === 'number' ? 'Span comment' : 'Comment'
  }
  return TYPE_LABELS[annotation.type] || annotation.type
}

function buildLegendEntries(ctx, annotations, numbers, maxWidth) {
  ctx.font = `${LEGEND_FONT_SIZE}px sans-serif`
  return annotations.map((annotation, index) => ({
    number: numbers[index],
    label: legendLabel(annotation),
    color: annotation.color || DEFAULT_COLOR,
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
export async function flattenAnnotations(imageBuffer, annotations, numbers = annotations.map((_, index) => index + 1)) {
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
      ctx.fillText(`${entry.number}. ${entry.label}`, LEGEND_PADDING + 18, y)
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

/**
 * Lay frames out as a labelled grid (a strip across a span, or an overview
 * of the whole recording), so the agent sees a sequence in one image
 * instead of having to open every frame.
 *
 * @param {{ buffer: Buffer, label: string }[]} tiles - all frames share one size
 * @param {{ columns: number, tileWidth: number }} layout - tileWidth is a maximum, frames are never upscaled
 */
export async function composeContactSheet(tiles, { columns, tileWidth }) {
  // Decoded one at a time: a full-size frame can take hundreds of megabytes.
  const first = await loadImage(tiles[0].buffer)
  const width = Math.min(tileWidth, first.width)
  const height = Math.round((first.height * width) / first.width)
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

  for (const [index, tile] of tiles.entries()) {
    const image = index === 0 ? first : await loadImage(tile.buffer)
    const x = CONTACT_SHEET_GAP + (index % cols) * (width + CONTACT_SHEET_GAP)
    const y = CONTACT_SHEET_GAP + Math.floor(index / cols) * (cellHeight + CONTACT_SHEET_GAP)
    ctx.drawImage(image, x, y, width, height)
    ctx.fillStyle = LEGEND_HEADER_COLOR
    ctx.fillText(tile.label, x + 4, y + height + CONTACT_SHEET_LABEL_HEIGHT / 2)
  }

  return canvas.toBuffer('image/png')
}
