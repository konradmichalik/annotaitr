/**
 * Whether a composer holds a draft that a click outside must not throw away:
 * text that differs from what it opened with, or any other change the caller
 * reports in `otherChanges` (a new colour or stroke). Only Esc and Cancel discard it.
 */
export function hasDraft(text, initialText = '', otherChanges = false) {
  return otherChanges || text.trim() !== initialText.trim()
}
