import { useEffect, useId, useRef } from 'react'
import { isSaveKey, MOD } from '../utils/keys.js'
import { IntentIcon } from './IntentIcon.jsx'

// A button has an empty value too, so only a text field counts. An input method composing text is typing, not deleting.
const isUntouchedField = (event, typed) => event.key === 'Backspace' && !event.nativeEvent.isComposing && !event.metaKey && !event.ctrlKey && !event.altKey &&
  !typed && ['TEXTAREA', 'INPUT'].includes(event.target.tagName) && event.target.value === ''

/**
 * The shell every note composer shares: a dialog named by a visually hidden
 * heading, the caller's field first, then one footer row with the caller's
 * tools, Cancel and the only filled button. `⌘↵` saves, `Esc` discards. A click
 * outside closes an untouched composer but keeps one that holds a draft
 * (`dirty`), so a stray click never loses text. `fieldLabelId` lets the caller
 * name its field by the heading. With `onRemove` the footer starts with a
 * Remove button, and `⌫` in a field nothing was typed into does the same: it
 * takes the thing out instead of commenting on it. Text that was typed and
 * then cleared never counts, so correcting a comment cannot remove anything.
 * `typedRef` lets a caller that remounts the composer (the expanded editor) keep that history.
 */
export function Composer({
  title, titleId, className = '', style, dirty, submitLabel, submitDisabled = false,
  onRemove = null, tools = null, children, onSave, onDiscard, onEscape = onDiscard, rootRef, typedRef
}) {
  const ownRef = useRef(null)
  const ref = rootRef ?? ownRef
  const fallbackId = useId()
  const headingId = titleId ?? fallbackId
  const ownTyped = useRef(false)
  const typed = typedRef ?? ownTyped

  useEffect(() => {
    if (dirty) { return }
    const handleMouseDown = (event) => {
      // The second press of a double click selects a word, it is not a dismissal.
      if (event.detail >= 2) { return }
      if (!ref.current?.contains(event.target)) { onDiscard() }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [dirty, onDiscard, ref])

  const save = () => {
    if (!submitDisabled) { onSave() }
  }

  const handleKeyDown = (event) => {
    if (event.defaultPrevented) { return }
    if (event.key === 'Escape') {
      event.preventDefault()
      onEscape(event)
    } else if (isSaveKey(event)) {
      event.preventDefault()
      save()
    } else if (onRemove && isUntouchedField(event, typed.current)) {
      event.preventDefault()
      onRemove()
    }
  }

  return (
    <div
      ref={ref}
      className={`comment-popover ${className}`.trim()}
      role="dialog"
      aria-labelledby={headingId}
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onInput={() => { typed.current = true }}
    >
      <h2 id={headingId} className="visually-hidden">{title}</h2>
      {children}
      <div className="composer-footer">
        {(onRemove || tools) && (
          <div className="composer-tools">
            {onRemove && (
              <button type="button" className="composer-remove" aria-keyshortcuts="Backspace" title="Mark for removal (⌫ before typing)" onClick={onRemove}>
                <IntentIcon intent="remove" />
                Remove
                <kbd className="key-cap" aria-hidden="true">⌫</kbd>
              </button>
            )}
            {tools}
          </div>
        )}
        <button type="button" className="composer-cancel" onClick={onDiscard}>Cancel</button>
        <button type="button" className="composer-submit" disabled={submitDisabled} aria-keyshortcuts="Meta+Enter Control+Enter" onClick={save}>
          {submitLabel}
          <kbd className="key-cap composer-submit-key" aria-hidden="true">{MOD}↵</kbd>
        </button>
      </div>
    </div>
  )
}
