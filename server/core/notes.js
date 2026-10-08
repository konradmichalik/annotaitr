/**
 * Intent and number of a note, for every mode's feedback. The clients keep
 * their own copy in client/shared/utils/intents.js, since server and client
 * share no modules. Change both together: the intent is part of the stdout
 * contract (docs/usage.md).
 */

export const INTENTS = ['change', 'add', 'remove', 'question']

const WORDS = { change: 'Change', add: 'Add', remove: 'Remove', question: 'Question' }

// A markdown deletion or insertion is what it is, whatever an imported field claims.
const FIXED_BY_TYPE = { DELETION: 'remove', INSERTION: 'add' }

/** A comment about the whole target: markdown's global comment, or an image comment without shape, page or time. */
export function isGeneral(annotation) {
  if (annotation.targetType === 'global') { return true }
  return annotation.type === 'comment' && !annotation.geometry &&
    typeof annotation.page !== 'number' && typeof annotation.time !== 'number'
}

export const isNumbered = (annotation) => annotation.type !== 'NOTES' && !isGeneral(annotation)

/** What the agent should do with a note. Old data without the field gets the default its type had. */
export function intentOf(annotation) {
  if (!isNumbered(annotation)) { return null }
  const fixed = FIXED_BY_TYPE[annotation.type]
  if (fixed) { return fixed }
  if (INTENTS.includes(annotation.intent)) { return annotation.intent }
  return annotation.type === 'pin' ? 'question' : 'change'
}

export const intentWord = (intent) => WORDS[intent] ?? 'General'

const validNumber = (value) => Number.isInteger(value) && value > 0

/**
 * Every note with its intent and its number. A number the reviewer's note
 * carries is kept, gaps included, because the agent and the annotated image
 * refer to it. A note without one (data from before numbers were stored, or
 * posted by hand) gets the next free number, in the order given.
 */
export function normalizeNotes(annotations) {
  const used = new Set()
  const kept = annotations.map((annotation) => {
    if (!isNumbered(annotation) || !validNumber(annotation.number) || used.has(annotation.number)) { return null }
    used.add(annotation.number)
    return annotation.number
  })
  let next = Math.max(0, ...used) + 1
  return annotations.map((annotation, index) => {
    const { number: _number, ...rest } = annotation
    const intent = intentOf(annotation)
    if (!isNumbered(annotation)) { return { ...rest, intent } }
    return { ...rest, intent, number: kept[index] ?? next++ }
  })
}

/** "2 Change, 1 Question, 1 General": notes per intent in a fixed order, the general comments last. */
export function intentCounts(annotations) {
  const counts = new Map([...INTENTS, null].map((intent) => [intent, 0]))
  for (const annotation of annotations) {
    if (annotation.type === 'NOTES') { continue }
    const intent = intentOf(annotation)
    counts.set(intent, counts.get(intent) + 1)
  }
  return [...counts].filter(([, count]) => count > 0).map(([intent, count]) => `${count} ${intentWord(intent)}`).join(', ')
}
