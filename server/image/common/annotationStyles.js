const VALID_ARROW_STYLES = new Set(['head', 'dimension', 'none', 'double'])

/**
 * Normalize an annotation's `arrowStyle` to one of the four known values,
 * the server twin of client/image/src/utils/annotationStyles.js's resolver
 * (client and server share no modules, so this duplication is deliberate).
 * Absent, legacy, and unknown-future values all resolve to 'head'.
 */
export function resolveArrowStyle(arrowStyle) {
  return VALID_ARROW_STYLES.has(arrowStyle) ? arrowStyle : 'head'
}

// Client-chosen widths (client/image/src/utils/annotationStyles.js is the
// source of truth for these two numbers - duplicated here only because
// client and server share no modules).
const CLIENT_DEFAULT_STROKE_WIDTH = 3
const CLIENT_DEFAULT_HIGHLIGHTER_WIDTH = 16

// The server has always rendered slightly larger than the client at the same
// logical size (STROKE_WIDTH 4 vs 3, HIGHLIGHTER_STROKE_WIDTH 18 vs 16,
// predating this feature). Preserve that per-type ratio for any client-
// chosen width, not just the two historical defaults.
const STROKE_SCALE = 4 / 3
const HIGHLIGHTER_SCALE = 18 / 16

// drawArrowhead's headLength was 16 at STROKE_WIDTH 4, and
// drawDimensionCaps' tick length was 18 at the same width - preserve both
// ratios so a configured width scales the head/ticks along with the shaft.
const HEAD_LENGTH_RATIO = 16 / 4
const DIMENSION_TICK_RATIO = 18 / 4

function clientStrokeWidthOf(annotation) {
  return annotation.strokeWidth
    ?? (annotation.type === 'highlighter' ? CLIENT_DEFAULT_HIGHLIGHTER_WIDTH : CLIENT_DEFAULT_STROKE_WIDTH)
}

/** An annotation's stroke width in server (canvas) units, scaled from the client value it was authored at. */
export function serverStrokeWidth(annotation) {
  const scale = annotation.type === 'highlighter' ? HIGHLIGHTER_SCALE : STROKE_SCALE
  return clientStrokeWidthOf(annotation) * scale
}

/** Canvas `setLineDash` array for an annotation's dash style, proportional to its (server-scaled) stroke width. `[]` (solid) for absent/unknown. */
export function serverDashArray(annotation) {
  const width = serverStrokeWidth(annotation)
  if (annotation.dashStyle === 'dashed') { return [width * 3, width * 2] }
  if (annotation.dashStyle === 'dotted') { return [width, width * 1.5] }
  return []
}

/** Arrowhead length in server units, proportional to the arrow's stroke width. */
export function serverHeadLength(annotation) {
  return serverStrokeWidth(annotation) * HEAD_LENGTH_RATIO
}

/** Dimension-line tick length in server units, proportional to the arrow's stroke width. */
export function serverDimensionTickLength(annotation) {
  return serverStrokeWidth(annotation) * DIMENSION_TICK_RATIO
}
