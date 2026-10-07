const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

/** The modifier key caps of the platform. */
export const MOD = isMac ? '⌘' : 'Ctrl'
export const ALT = isMac ? '⌥' : 'Alt'

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'])

/** Whether a key pressed on `target` is typed into it: a text field, a select or editable content. */
export function isTypingTarget(target) {
  if (!target) { return false }
  if (target.isContentEditable) { return true }
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') { return true }
  if (tag === 'INPUT') { return !NON_TEXT_INPUTS.has((target.getAttribute('type') || 'text').toLowerCase()) }
  return false
}

/**
 * Whether a key press can serve as a single-key shortcut: no modifier held
 * (so Cmd+Z, Shift for the temporary mode and friends keep working), not
 * typed into a field, not inside a menu or dialog (which use letters and
 * Escape themselves) and not already handled by something else.
 */
export function isPlainKeyPress(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) { return false }
  const target = event.target
  if (isTypingTarget(target)) { return false }
  return !target?.closest?.('[role="menu"], [role="dialog"], [role="listbox"]')
}

/**
 * ⌘/Ctrl+Enter saves a note or submits the open dialog. Shift is left out on
 * purpose: ⌘/Ctrl+Shift+Enter opens the decision, and it must never also save.
 */
export function isSaveKey(event) {
  if (event.key !== 'Enter' || event.shiftKey || !(event.metaKey || event.ctrlKey)) { return false }
  return !(event.isComposing || event.nativeEvent?.isComposing)
}

/**
 * `?` opens the shortcut list: no Ctrl, Cmd or Alt (Shift is how most
 * layouts type it), not typed into a field and not inside a menu or dialog.
 */
export function isShortcutListKey(event) {
  if (event.key !== '?' || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) { return false }
  const target = event.target
  if (isTypingTarget(target)) { return false }
  return !target?.closest?.('[role="menu"], [role="dialog"], [role="listbox"]')
}
