import { intentOf, intentWord } from './intents.js'

/**
 * What a panel card shows for a note: its intent as the word, and the shape
 * or kind of mark, which goes into the location meta ("Page 1 · Box").
 */
const SHAPES = {
  box: 'Box',
  element: 'Element',
  text: 'Text',
  arrow: 'Arrow',
  freehand: 'Freehand',
  highlighter: 'Highlight',
  pin: 'Pin',
  comment: 'Comment'
}

const MARKDOWN_TARGETS = {
  image: 'Image',
  diagram: 'Diagram',
  math: 'Formula',
  pinpoint: 'Block',
  token: 'Token',
  link: 'Link'
}

function shapeOf(annotation) {
  if (annotation.type === 'INSERTION') { return 'Insertion' }
  if (['DELETION', 'COMMENT'].includes(annotation.type)) { return MARKDOWN_TARGETS[annotation.targetType] ?? 'Text' }
  if (SHAPES[annotation.type]) { return SHAPES[annotation.type] }
  const type = String(annotation.type ?? '')
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
}

export function noteType(annotation) {
  const intent = intentOf(annotation)
  if (!intent) { return { word: 'General', intent: null, shape: null } }
  return { word: intentWord(intent), intent, shape: shapeOf(annotation) }
}
