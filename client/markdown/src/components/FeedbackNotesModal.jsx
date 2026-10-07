import { useRef } from 'react'
import { CloseIcon } from '../../../shared/components/CloseIcon.jsx'
import { useModalDismiss } from '../../../shared/hooks/useModalDismiss.js'

export function FeedbackNotesModal({ isOpen, onClose, notesGroups, totalFiles }) {
  const dialogRef = useRef(null)

  useModalDismiss(isOpen, onClose, dialogRef)

  if (!isOpen) {return null}

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {onClose()}
  }

  const isMultiFile = totalFiles > 1

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal notes-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notes-modal-title"
      >
        <div className="modal-header">
          <h2 id="notes-modal-title">AI Notes</h2>
          <button className="modal-close" onClick={onClose} title="Close" aria-label="Close notes">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          {notesGroups.map(({ filePath, notes }) => (
            <div key={filePath}>
              {isMultiFile && (
                <h3 className="notes-modal-file-heading">
                  {filePath.split('/').pop()}
                </h3>
              )}
              <ul className="notes-modal-list">
                {notes.map(ann => (
                  <li key={ann.id} className="notes-modal-item">
                    <p className="notes-modal-text">{ann.text}</p>
                    {ann.originalText && (
                      <p className="notes-modal-context">
                        &ldquo;{ann.originalText.length > 80
                          ? ann.originalText.slice(0, 80) + '...'
                          : ann.originalText}&rdquo;
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
