import { useEffect, useId, useRef, useState } from 'react'
import { isPlainKeyPress, isSaveKey } from '../utils/keys.js'
import { KeyCap } from './KeyCap.jsx'
import { PlusIcon } from './HeaderIcons.jsx'

function PlainField({ id, value, setValue, onKeyDown, inputRef }) {
  return (
    <textarea
      id={id}
      ref={inputRef}
      className="panel-global-textarea"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder="What should the agent know about the whole review?"
    />
  )
}

/**
 * The general comment at the bottom of the panel: a dashed row that opens
 * into a labelled field on click or with G, and shows the start of the text
 * once written. `onSave` gets the new text, empty to remove the comment.
 * `Field` replaces the plain textarea; it gets `id`, `value`, `setValue`,
 * `onKeyDown` (Cmd/Ctrl+Enter saves, Escape cancels) and `inputRef`.
 */
export function GeneralCommentRow({ text, onSave, disabled = false, Field = PlainField }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  const rowRef = useRef(null)
  const id = useId()

  const start = () => {
    setDraft(text ?? '')
    setOpen(true)
  }

  useEffect(() => {
    if (open) { inputRef.current?.focus() }
  }, [open])

  useEffect(() => {
    if (disabled || open) { return }
    const handleKeyDown = (event) => {
      if (event.key.toLowerCase() !== 'g' || !isPlainKeyPress(event)) { return }
      event.preventDefault()
      setDraft(text ?? '')
      setOpen(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [disabled, open, text])

  const close = () => {
    setOpen(false)
    requestAnimationFrame(() => rowRef.current?.focus())
  }
  const save = () => {
    onSave(draft.trim() ? draft : '')
    close()
  }
  const handleKeyDown = (event) => {
    if (isSaveKey(event)) {
      event.preventDefault()
      save()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  if (!open) {
    return (
      <div className="general-comment">
        <button ref={rowRef} type="button" className="general-comment-row" aria-keyshortcuts="G" onClick={start}>
          <PlusIcon />
          <span className="general-comment-label">General comment</span>
          {text && <span className="general-comment-preview">{text}</span>}
          <KeyCap>G</KeyCap>
        </button>
      </div>
    )
  }

  return (
    <div className="general-comment general-comment--open">
      <label className="general-comment-field-label" htmlFor={id}>General comment</label>
      <Field id={id} value={draft} setValue={setDraft} onKeyDown={handleKeyDown} inputRef={inputRef} />
      <div className="panel-global-edit-actions">
        <button type="button" className="panel-cancel-btn" onClick={close}>Cancel</button>
        <button type="button" className="panel-global-save-btn" onClick={save}>Save</button>
      </div>
    </div>
  )
}
