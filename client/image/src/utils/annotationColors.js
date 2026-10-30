import { markIndex } from '../../../shared/utils/intents.js'

/**
 * Ink colours: an optional style a shape can carry for visibility on a busy
 * image. Without one a mark takes the colour of its number, round and round,
 * so neighbouring notes differ and the colour never says what a note asks for.
 */
export const ANNOTATION_COLORS = [
  { id: 'red', hex: '#bf616a' },
  { id: 'orange', hex: '#d08770' },
  { id: 'amber', hex: '#c9a227' },
  { id: 'yellow', hex: '#ebcb8b' },
  { id: 'green', hex: '#a3be8c' },
  { id: 'teal', hex: '#8fbcbb' },
  { id: 'cyan', hex: '#88c0d0' },
  { id: 'blue', hex: '#5e81ac' },
  { id: 'purple', hex: '#b48ead' },
  { id: 'pink', hex: '#d196d0' }
]

export const DEFAULT_ANNOTATION_COLOR = ANNOTATION_COLORS[0].hex

export const numberMark = (number) => `var(--mark-${markIndex(number)})`
export const numberOnMark = (number) => `var(--mark-${markIndex(number)}-on)`

/** The colour a shape is drawn in: its ink when it has one, the colour of its number otherwise. */
export function markColor(annotation, number = annotation.number) {
  return annotation.color || numberMark(number)
}
