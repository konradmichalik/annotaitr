/**
 * The note `delta` places from the selected one in `ids` (the notes in
 * feedback order), stopping at the first and the last. With none selected,
 * forward goes to the first note and back to the last.
 */
export function stepNote(ids, currentId, delta) {
  if (ids.length === 0) { return null }
  const index = ids.indexOf(currentId)
  if (index === -1) { return delta > 0 ? ids[0] : ids.at(-1) }
  return ids[Math.min(ids.length - 1, Math.max(0, index + delta))]
}

/** The one-based place of the selected note in `ids`, 0 when none of them is selected. */
export function notePosition(ids, currentId) {
  return ids.indexOf(currentId) + 1
}
