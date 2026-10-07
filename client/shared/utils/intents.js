/**
 * What a note asks the agent to do, and the number it keeps for the whole
 * round. Mirrors server/core/notes.js (client and server share no modules):
 * the intent and the number are part of the stdout contract, so the card
 * and the output must agree.
 */

export const INTENTS = [
  { id: 'change', word: 'Change', key: '1' },
  { id: 'add', word: 'Add', key: '2' },
  { id: 'remove', word: 'Remove', key: '3' },
  { id: 'question', word: 'Question', key: '4' }
]

const IDS = INTENTS.map((intent) => intent.id)

// A markdown deletion or insertion is what it is, whatever an imported field claims.
const FIXED_BY_TYPE = { DELETION: 'remove', INSERTION: 'add' }

/** A comment about the whole target: markdown's global comment, or an image comment without shape, page or time. */
export function isGeneral(annotation) {
  if (annotation.targetType === 'global') { return true }
  return annotation.type === 'comment' && !annotation.geometry &&
    typeof annotation.page !== 'number' && typeof annotation.time !== 'number'
}

export const isNumbered = (annotation) => annotation.type !== 'NOTES' && !isGeneral(annotation)

/** The intent a new note of this type starts with: Question for a pin, Change for everything else. */
export function defaultIntent(type) {
  return FIXED_BY_TYPE[type] ?? (type === 'pin' ? 'question' : 'change')
}

/** The note's intent; old data without the field gets the default of its type. Null for general comments. */
export function intentOf(annotation) {
  if (!isNumbered(annotation)) { return null }
  const fixed = FIXED_BY_TYPE[annotation.type]
  if (fixed) { return fixed }
  return IDS.includes(annotation.intent) ? annotation.intent : defaultIntent(annotation.type)
}

export const intentWord = (intent) => INTENTS.find((i) => i.id === intent)?.word ?? 'General'

/** The intent a key from 1 to 4 picks, or null. */
export const intentForKey = (key) => INTENTS.find((i) => i.key === key)?.id ?? null

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

/** The note badge colours: the intent's mark with its number colour. */
export function intentBadgeStyle(intent) {
  return intent ? { background: `var(--intent-${intent}-mark)`, color: `var(--intent-${intent}-on-mark)` } : undefined
}
