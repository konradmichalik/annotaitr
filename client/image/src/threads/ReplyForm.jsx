import { useId, useRef, useState } from 'react'
import { postReply } from './replyApi.js'

export default function ReplyForm({ handle, onSent }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const fieldRef = useRef(null)
  const id = useId()
  const errorId = `${id}-error`

  const send = async () => {
    if (sending || !text.trim()) { return }
    setSending(true)
    const result = await postReply(handle, text)
    setSending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setError(null)
    setText('')
    onSent()
    fieldRef.current?.focus()
  }

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
        value={text}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {error && <p id={errorId} className="reply-form-error" role="alert">{error}</p>}
      <button type="button" className="reply-form-send" disabled={sending} onClick={send}>Send</button>
    </div>
  )
}
