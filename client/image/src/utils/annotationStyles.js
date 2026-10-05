const VALID_ARROW_STYLES = new Set(['head', 'dimension', 'none', 'double'])

/** Metadata for the arrow end-style picker, in display order. */
export const ARROW_STYLES = [
  { id: 'head', label: 'Arrowhead' },
  { id: 'dimension', label: 'Dimension ticks' },
  { id: 'none', label: 'No head' },
  { id: 'double', label: 'Double-headed' }
]

/**
 * Normalize an annotation's `arrowStyle` to one of the four known values.
 * Absent, legacy, and unknown-future values all resolve to 'head', matching
 * the original (pre-variant) rendering exactly, so old exports and
 * annotations created before this feature existed keep looking the same.
 */
export function resolveArrowStyle(arrowStyle) {
  return VALID_ARROW_STYLES.has(arrowStyle) ? arrowStyle : 'head'
}

/** Named stroke-width presets for box/arrow/freehand, matching today's STROKE_WIDTH at 'medium'. */
export const STROKE_PRESETS = [
  { id: 'thin', label: 'Thin', value: 2 },
  { id: 'medium', label: 'Medium', value: 3 },
  { id: 'thick', label: 'Thick', value: 5 }
]

/** Named stripe-size presets for the highlighter, matching today's HIGHLIGHTER_STROKE_WIDTH at 'medium'. */
export const HIGHLIGHTER_PRESETS = [
  { id: 'thin', label: 'Thin', value: 10 },
  { id: 'medium', label: 'Medium', value: 16 },
  { id: 'thick', label: 'Thick', value: 26 }
]

export const DEFAULT_STROKE_WIDTH = 3
export const DEFAULT_HIGHLIGHTER_WIDTH = 16

/** The width preset list to offer for a given annotation type. */
export function presetsFor(type) {
  return type === 'highlighter' ? HIGHLIGHTER_PRESETS : STROKE_PRESETS
}

function defaultStrokeWidthFor(type) {
  return type === 'highlighter' ? DEFAULT_HIGHLIGHTER_WIDTH : DEFAULT_STROKE_WIDTH
}

/** An annotation's effective stroke width: its own stored value, or the type-appropriate default if absent (so legacy/imported annotations render exactly as before). */
export function strokeWidthOf(annotation) {
  return annotation.strokeWidth ?? defaultStrokeWidthFor(annotation.type)
}

export const DASH_STYLES = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' }
]

/**
 * SVG `stroke-dasharray` for a dash style, expressed in units of the actual
 * stroke width so it reads as dashed/dotted at any configured thickness
 * instead of looking nearly-solid when thick or vanishing when thin.
 * Returns undefined (equivalent to solid) for 'solid', absent, or unknown.
 */
export function dashArrayFor(dashStyle, strokeWidth) {
  if (dashStyle === 'dashed') { return `${strokeWidth * 3} ${strokeWidth * 2}` }
  if (dashStyle === 'dotted') { return `${strokeWidth} ${strokeWidth * 1.5}` }
  return undefined
}

/**
 * Which style fields the popover should offer for a given annotation type,
 * and which fields ImageCanvas should thread through create/edit. A single
 * table drives all three so a new field or type is declared once, not
 * copy-pasted as a conditional at every read site.
 */
export const STYLE_FIELDS = {
  box: ['strokeWidth', 'dashStyle'],
  // Tied to the element's own outline, so only its color is up for choice.
  element: [],
  arrow: ['arrowStyle', 'strokeWidth', 'dashStyle'],
  freehand: ['strokeWidth', 'dashStyle'],
  highlighter: ['strokeWidth'],
  pin: []
}

/** Pick only the style fields relevant to `type` out of `source`, per STYLE_FIELDS. */
export function pickStyleFields(type, source) {
  const result = {}
  for (const field of STYLE_FIELDS[type] || []) {
    if (field in source) { result[field] = source[field] }
  }
  return result
}
