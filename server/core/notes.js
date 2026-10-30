/**
 * Kind and number of a note, for every mode's feedback. A note is a comment
 * or a removal, nothing else: what a comment asks for is in its words. The
 * clients keep their own copy in client/shared/utils/intents.js, since server
 * and client share no modules. Change both together: the kind is part of the
 * stdout contract (docs/usage.md).
 */

export const INTENTS = ['comment', 'remove']

const WORDS = { comment: 'Comment', remove: 'Remove' }

// A markdown deletion or insertion is what it is, whatever an imported field claims.
const FIXED_BY_TYPE = { DELETION: 'remove', INSERTION: 'comment' }

/** A comment about the whole target: markdown's global comment, or an image comment without shape, page or time. */
export function isGeneral(annotation) {
  if (annotation.targetType === 'global') { return true }
  return annotation.type === 'comment' && !annotation.geometry &&
    typeof annotation.page !== 'number' && typeof annotation.time !== 'number'
}

export const isNumbered = (annotation) => annotation.type !== 'NOTES' && !isGeneral(annotation)

/** Whether a note takes something out or is a comment. The Change, Add and Question of older data read as comments. */
export function intentOf(annotation) {
  if (!isNumbered(annotation)) { return null }
  return FIXED_BY_TYPE[annotation.type] ?? (annotation.intent === 'remove' ? 'remove' : 'comment')
}

export const intentWord = (intent) => WORDS[intent] ?? 'General'

/** What leads a heading: `Remove · ` for a removal, nothing for a comment, whose text says what it wants. */
export const kindPrefix = (annotation) => intentOf(annotation) === 'remove' ? `${intentWord('remove')} · ` : ''

const validNumber = (value) => Number.isInteger(value) && value > 0

/**
 * Every note with its kind and its number. A number the reviewer's note
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

/** "3 Comment, 1 Remove, 1 General": notes per kind in a fixed order, the general comments last. */
export function intentCounts(annotations) {
  const counts = new Map([...INTENTS, null].map((intent) => [intent, 0]))
  for (const annotation of annotations) {
    if (annotation.type === 'NOTES') { continue }
    const intent = intentOf(annotation)
    counts.set(intent, counts.get(intent) + 1)
  }
  return [...counts].filter(([, count]) => count > 0).map(([intent, count]) => `${count} ${intentWord(intent)}`).join(', ')
}
