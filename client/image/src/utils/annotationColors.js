import { intentOf } from '../../../shared/utils/intents.js'

/**
 * Ink colours: an optional style a shape can carry for visibility on a busy
 * image. Without one a mark takes its intent's colour, which never changes:
 * the number badge always shows the intent (docs/design/rules.md, Intents).
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

export const intentMark = (intent) => `var(--intent-${intent ?? 'change'}-mark)`
export const intentOnMark = (intent) => `var(--intent-${intent ?? 'change'}-on-mark)`

/** The colour a shape is drawn in: its ink when it has one, its intent's mark colour otherwise. */
export function markColor(annotation) {
  return annotation.color || intentMark(intentOf(annotation))
}
