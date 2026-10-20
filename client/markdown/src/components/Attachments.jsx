import { useRef } from 'react'
import { PaperclipIcon } from '../../../shared/components/HeaderIcons.jsx'
import { CloseIcon } from '../../../shared/components/CloseIcon.jsx'
import { ACCEPTED_TYPES, attachmentUrl } from '../utils/attachments.js'

/** The footer button that opens the file picker. */
export function AttachButton({ busy, onAdd }) {
  const inputRef = useRef(null)
  return (
    <>
      <button
        type="button"
        className="composer-icon-button"
        onClick={() => inputRef.current?.click()}
        title="Attach image"
        aria-label="Attach image"
        aria-busy={busy}
      >
        <PaperclipIcon size={14} />
      </button>
      <input
        ref={inputRef}
        type="file"
        className="visually-hidden"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onAdd([...event.target.files])
          event.target.value = ''
        }}
      />
    </>
  )
}

const imageName = (attachment, index) => `Attached image ${index + 1}: ${attachment.name}`

function uploadStatus(busy, count) {
  if (busy) { return 'Uploading image…' }
  return count > 0 ? `${count} image${count === 1 ? '' : 's'} attached` : ''
}

/**
 * The attached images below the field, each with a button to take it off again, and the last
 * upload error. The status line stays mounted, so a screen reader hears a paste or drop land.
 */
export function AttachmentList({ attachments, busy, error, onRemove }) {
  return (
    <div className="composer-attachments">
      {attachments.length > 0 && (
        <ul className="composer-attachment-list" aria-label="Attached images">
          {attachments.map((attachment, index) => (
            <li key={attachment.id} className="composer-attachment">
              <img src={attachmentUrl(attachment)} alt={imageName(attachment, index)} />
              <button
                type="button"
                className="composer-attachment-remove"
                onClick={() => onRemove(attachment.id)}
                aria-label={`Remove attached image ${index + 1}`}
                title={`Remove ${attachment.name}`}
              >
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="visually-hidden" role="status">{uploadStatus(busy, attachments.length)}</p>
      {error && <p className="composer-attachment-error" role="alert">{error}</p>}
    </div>
  )
}

/** The images of a saved note on its card, each opening at full size in a new tab. */
export function NoteAttachments({ attachments }) {
  if (!(attachments?.length > 0)) { return null }
  return (
    <ul className="note-attachments" aria-label="Attached images">
      {attachments.map((attachment, index) => (
        <li key={attachment.id}>
          <a href={attachmentUrl(attachment)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
            <img src={attachmentUrl(attachment)} alt={imageName(attachment, index)} />
            <span className="visually-hidden">(opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
