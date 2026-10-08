import { useEffect, useId, useRef, useState } from 'react'
import { postReply } from './replyApi.js'

// The owner holds the error so a failed removal shows here too, and `fieldRef` lets it focus the field.
export default function ReplyForm({ handle, onSent, error, onError, fieldRef }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const refocusRef = useRef(false)
  const id = useId()
  const errorId = `${id}-error`

  const send = async () => {
    if (sending) { return }
    setSending(true)
    const result = await postReply(handle, text)
    setSending(false)
    if (result.error) {
      onError(result.error)
      return
    }
    onError(null)
    setText('')
    refocusRef.current = true
    onSent()
  }

  // The field is disabled while sending, so focus can only return once it is enabled again.
  useEffect(() => {
    if (!sending && refocusRef.current) {
      refocusRef.current = false
      fieldRef.current?.focus()
    }
  }, [sending, fieldRef])

  // Escape still reaches the popover's own listener, everything else must stay out of the annotator's shortcuts.
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') { return }
    event.stopPropagation()
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      send()
    }
  }

  return (
    <div className="reply-form">
      <label className="reply-form-label" htmlFor={`${id}-field`}>Reply to the agent</label>
      <textarea
        id={`${id}-field`}
        ref={fieldRef}
        className="reply-form-field"
        rows={2}
        disabled={sending}
        value={text}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(event) => { setText(event.target.value); if (error) { onError(null) } }}
        onKeyDown={handleKeyDown}
      />
      {error && <p id={errorId} className="reply-form-error" role="alert">{error}</p>}
      <button type="button" className="reply-form-send" disabled={sending} onClick={send}>Send</button>
    </div>
  )
}
