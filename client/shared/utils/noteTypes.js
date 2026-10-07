/**
 * The word and intent a panel card shows for a note. Until notes carry an
 * intent of their own, the type stands in for it: markdown types map to the
 * intent they mean, image notes are named by their shape. This is the one
 * place to change when the intent field arrives.
 */
const NOTE_TYPES = {
  DELETION: { word: 'Remove', intent: 'remove' },
  INSERTION: { word: 'Add', intent: 'add' },
  COMMENT: { word: 'Comment', intent: 'change' },
  box: { word: 'Box', intent: null },
  element: { word: 'Element', intent: null },
  text: { word: 'Text', intent: null },
  arrow: { word: 'Arrow', intent: null },
  freehand: { word: 'Freehand', intent: null },
  highlighter: { word: 'Highlight', intent: null },
  pin: { word: 'Pin', intent: null },
  comment: { word: 'Comment', intent: null }
}

const GENERAL = { word: 'General', intent: null }

// An image comment without shape, page or time is about the whole target.
const isGeneralImageComment = (a) => a.type === 'comment' && !a.geometry && typeof a.page !== 'number' && typeof a.time !== 'number'

export function noteType(annotation) {
  if (annotation.targetType === 'global' || isGeneralImageComment(annotation)) { return GENERAL }
  const known = NOTE_TYPES[annotation.type]
  if (known) { return known }
  const type = String(annotation.type ?? '')
  return { word: type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(), intent: null }
}
