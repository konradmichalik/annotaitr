import { useRef, useState } from 'react'
import { CloseIcon } from '../../../shared/components/CloseIcon.jsx'
import { useModalDismiss } from '../../../shared/hooks/useModalDismiss.js'
import { serializeAnnotations, parseAnnotationsJson } from '../utils/exportImport.js'

export default function ExportModal({ annotations, onImport, onClose }) {
  const [draft, setDraft] = useState(() => serializeAnnotations(annotations))
  const [error, setError] = useState(null)
  const dialogRef = useRef(null)

  useModalDismiss(true, onClose, dialogRef)

  const handleImport = () => {
    try {
      const imported = parseAnnotationsJson(draft)
      if (annotations.length > 0) {
        const proceed = window.confirm(
          `This will replace ${annotations.length} existing annotation(s) with ${imported.length} imported annotation(s).\n\nContinue?`
        )
        if (!proceed) { return }
      }
      onImport(imported)
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) { onClose() } }}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        <div className="modal-header">
          <h2 id="export-modal-title">Export / Import Annotations</h2>
          <button type="button" className="modal-close" onClick={onClose} title="Close" aria-label="Close export dialog">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          <label className="visually-hidden" htmlFor="export-modal-json">Annotations as JSON</label>
          <textarea
            id="export-modal-json"
            className="modal-preview modal-preview--editable"
            value={draft}
            onChange={(event) => { setDraft(event.target.value); setError(null) }}
            aria-describedby={error ? 'export-modal-error' : undefined}
            spellCheck={false}
          />
          {error && <p id="export-modal-error" className="modal-error" role="alert">{error}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleImport}>Import</button>
        </div>
      </div>
    </div>
  )
}
