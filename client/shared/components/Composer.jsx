import { useEffect, useId, useRef } from 'react'
import { isSaveKey, MOD } from '../utils/keys.js'
import { intentForKey } from '../utils/intents.js'
import { IntentChip } from './IntentChip.jsx'

// Digits typed into a field are text; only outside of it do they pick an intent.
const isTextEntry = (target) => target.isContentEditable || ['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName)

/**
 * The shell every note composer shares: a dialog named by a visually hidden
 * heading, the caller's field first, then one footer row with the caller's
 * tools, Cancel and the only filled button. `⌘↵` saves, `Esc` discards. A click
 * outside closes an untouched composer but keeps one that holds a draft
 * (`dirty`), so a stray click never loses text. `fieldLabelId` lets the caller
 * name its field by the heading. With `onIntentChange` the footer starts with
 * the intent chip, and the keys 1 to 4 switch the intent while focus is in
 * the composer but not in a text field.
 */
export function Composer({
  title, titleId, className = '', style, dirty, submitLabel, submitDisabled = false,
  intent = null, onIntentChange = null, tools = null, children, onSave, onDiscard, onEscape = onDiscard, rootRef
}) {
  const ownRef = useRef(null)
  const ref = rootRef ?? ownRef
  const fallbackId = useId()
  const headingId = titleId ?? fallbackId

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
    } else if (onIntentChange && !event.metaKey && !event.ctrlKey && !event.altKey && !isTextEntry(event.target)) {
      const picked = intentForKey(event.key)
      if (!picked) { return }
      event.preventDefault()
      onIntentChange(picked)
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
    >
      <h2 id={headingId} className="visually-hidden">{title}</h2>
      {children}
      <div className="composer-footer">
        {(onIntentChange || tools) && (
          <div className="composer-tools">
            {onIntentChange && <IntentChip intent={intent} onChange={onIntentChange} />}
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
