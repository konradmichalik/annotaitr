import { useEffect, useRef, useState } from 'react'
import { formatAnnotationsForExport, formatAnnotationsForJsonExport, copyToClipboard, downloadAsFile, downloadAsJsonFile } from '../utils/export.js'
import { CloseIcon } from '../../../shared/components/CloseIcon.jsx'
import { useModalDismiss } from '../../../shared/hooks/useModalDismiss.js'

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>
)

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

const ChevronIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

export function ExportModal({ isOpen, onClose, annotations, blocks, filePath, contentHash, onToast }) {
  const [content, setContent] = useState('')
  const [downloadOpen, setDownloadOpen] = useState(false)
  const dialogRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setContent(formatAnnotationsForExport(annotations, blocks, filePath))
    }
  }, [isOpen, annotations, blocks, filePath])

  useModalDismiss(isOpen, onClose, dialogRef)

  useEffect(() => {
    if (!isOpen) {setDownloadOpen(false)}
  }, [isOpen])

  if (!isOpen) {return null}

  const handleCopy = async () => {
    await copyToClipboard(content)
    onToast?.('Copied to clipboard')
  }

  const handleDownload = () => {
    const filename = filePath
      ? `${filePath.split('/').pop().replace('.md', '')}-annotations.md`
      : 'annotations.md'
    downloadAsFile(content, filename)
    onToast?.('Downloaded as Markdown')
  }

  const handleDownloadJson = () => {
    const data = formatAnnotationsForJsonExport(annotations, filePath, contentHash)
    const filename = filePath
      ? `${filePath.split('/').pop().replace('.md', '')}-annotations.json`
      : 'annotations.json'
    downloadAsJsonFile(data, filename)
    onToast?.('Downloaded as JSON')
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {onClose()}
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        <div className="modal-header">
          <h2 id="export-modal-title">Export Annotations</h2>
          <button className="modal-close" onClick={onClose} title="Close" aria-label="Close export dialog">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          <pre className="modal-preview">{content}</pre>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-export" onClick={handleCopy}>
            <CopyIcon />
            Copy
          </button>
          <div className="dropdown">
            <button className="btn btn-export" onClick={() => setDownloadOpen(prev => !prev)}>
              <DownloadIcon />
              Download
              <ChevronIcon />
            </button>
            {downloadOpen && (
              <div className="dropdown-menu">
                <button className="dropdown-item" onClick={() => { handleDownload(); setDownloadOpen(false) }}>
                  <span className="dropdown-item-label">Markdown</span>
                  <span className="dropdown-item-hint">For sharing and reading</span>
                </button>
                <button className="dropdown-item" onClick={() => { handleDownloadJson(); setDownloadOpen(false) }}>
                  <span className="dropdown-item-label">JSON</span>
                  <span className="dropdown-item-hint">For re-importing later</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
