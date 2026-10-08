import { useEffect, useId, useRef } from 'react'
import { isSaveKey } from '../utils/keys.js'
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
 * into a labelled field on click or with G. Once written, the text is shown
 * by its card in the note list, so the row only offers to edit it. `editor`
 * comes from `useGeneralComment`. `Field` replaces the plain textarea; it gets
 * `id`, `value`, `setValue`, `onKeyDown` (Cmd/Ctrl+Enter saves, Escape
 * cancels) and `inputRef`.
 */
export function GeneralCommentRow({ editor, Field = PlainField }) {
  const { open, text, draft, setDraft, start, close, save, rowRef } = editor
  const inputRef = useRef(null)
  const id = useId()

  useEffect(() => {
    if (open) { inputRef.current?.focus() }
  }, [open])

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
          <span className="general-comment-label">{text ? 'Edit general comment' : 'General comment'}</span>
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
