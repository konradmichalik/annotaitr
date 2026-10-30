/**
 * The kind of a note and the number it keeps for the whole round. A note is a
 * comment or a removal: what a comment asks for is in its words. Mirrors
 * server/core/notes.js (client and server share no modules): the kind and the
 * number are part of the stdout contract, so the card and the output must agree.
 */

export const INTENTS = [
  { id: 'comment', word: 'Comment' },
  { id: 'remove', word: 'Remove' }
]

// A markdown deletion or insertion is what it is, whatever an imported field claims.
const FIXED_BY_TYPE = { DELETION: 'remove', INSERTION: 'comment' }

/** A comment about the whole target: markdown's global comment, or an image comment without shape, page or time. */
export function isGeneral(annotation) {
  if (annotation.targetType === 'global') { return true }
  return annotation.type === 'comment' && !annotation.geometry &&
    typeof annotation.page !== 'number' && typeof annotation.time !== 'number'
}

export const isNumbered = (annotation) => annotation.type !== 'NOTES' && !isGeneral(annotation)

/** The kind a new note of this type starts with: a comment, except the fixed markdown types. */
export const defaultIntent = (type) => FIXED_BY_TYPE[type] ?? 'comment'

/** The kind of the note. The Change, Add and Question of older data read as comments. Null for general comments. */
export function intentOf(annotation) {
  if (!isNumbered(annotation)) { return null }
  return FIXED_BY_TYPE[annotation.type] ?? (annotation.intent === 'remove' ? 'remove' : 'comment')
}

export const intentWord = (intent) => INTENTS.find((i) => i.id === intent)?.word ?? 'General'

const validNumber = (value) => Number.isInteger(value) && value > 0

/** The number the next note gets: one above every number in use, also by notes that undo can bring back. */
export function nextNumber(...groups) {
  const numbers = groups.flat().map((a) => a?.number).filter(validNumber)
  return Math.max(0, ...numbers) + 1
}

/**
 * Every note with its intent and number. A number the note carries is kept,
 * gaps included. Notes without one (an import, a draft or a round saved
 * before numbers were stored) get the next free numbers in `order`, which is
 * how the earlier version numbered them. `reserved` are numbers other files
 * of the same review already use.
 */
export function normalizeNotes(annotations, { order = (list) => list, reserved = [] } = {}) {
  const used = new Set(reserved.filter(validNumber))
  const kept = new Map()
  for (const annotation of annotations) {
    if (!isNumbered(annotation) || !validNumber(annotation.number) || used.has(annotation.number)) { continue }
    used.add(annotation.number)
    kept.set(annotation, annotation.number)
  }
  let next = Math.max(0, ...used) + 1
  for (const annotation of order(annotations)) {
    if (isNumbered(annotation) && !kept.has(annotation)) { kept.set(annotation, next++) }
  }
  return annotations.map((annotation) => {
    const { number: _number, ...rest } = annotation
    const intent = intentOf(annotation)
    return isNumbered(annotation) ? { ...rest, intent, number: kept.get(annotation) } : { ...rest, intent }
  })
}

const MARK_COUNT = 4

/** Which of the four mark colours note `number` takes: 1 for note 1, round and round. The first without a usable number. */
export const markIndex = (number) => (Number.isInteger(number) && number > 0 ? ((number - 1) % MARK_COUNT) + 1 : 1)

/** The colour of a note's number, which is the colour of its mark: the mark with its number colour. */
export const markStyle = (number) => ({ background: `var(--mark-${markIndex(number)})`, color: `var(--mark-${markIndex(number)}-on)` })
