import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CommentPopover } from './CommentPopover.jsx'
import { QuickLabelPicker } from './QuickLabelPicker.jsx'
import { CloseIcon } from '../../../shared/components/CloseIcon.jsx'
import { TrashIcon, PencilIcon, CommentIcon, PlusIcon, ExternalLinkIcon, FileIcon, TagIcon } from './Icons.jsx'

const OpenLinkButton = ({ linkUrl, onOpenLink }) => {
  const isInternal = !!onOpenLink
  return (
    <button
      onClick={() => isInternal ? onOpenLink(linkUrl) : window.open(linkUrl, '_blank', 'noopener,noreferrer')}
      className="toolbar-btn toolbar-btn-link"
      title={isInternal ? 'Open file' : 'Open link'}
    >
      {isInternal ? <FileIcon /> : <ExternalLinkIcon />}
      <span className="toolbar-label">Open</span>
    </button>
  )
}

export function Toolbar({ highlightElement, onAnnotate, onClose, onDelete, onQuickLabel, requestedStep: requestedStepProp, editAnnotation, elementMode, insertionMode, linkUrl, onOpenLink }) {
  const [step, setStep] = useState('menu')
  const [initialText, setInitialText] = useState('')
  const [position, setPosition] = useState(null)
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)

  // NOTES annotations are read-only — close toolbar immediately
  useEffect(() => {
    if (editAnnotation?.type === 'NOTES') {
      onClose()
    }
  }, [editAnnotation, onClose])

  useEffect(() => {
    if (editAnnotation) {
      setStep('menu')
      setInitialText(editAnnotation.text || '')
    } else if (insertionMode) {
      setStep('menu')
      setInitialText('')
    } else if (requestedStepProp) {
      setStep('input')
      setInitialText('')
    } else {
      setStep('menu')
      setInitialText('')
    }
  }, [highlightElement, requestedStepProp, editAnnotation, elementMode, insertionMode])

  // Type-to-comment: any printable key in menu state transitions to input
  useEffect(() => {
    if (step !== 'menu' || !highlightElement || editAnnotation) {return}
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'textarea' || tag === 'input') {return}
      if (e.metaKey || e.ctrlKey || e.altKey) {return}
      if (e.key.length !== 1) {return}
      e.preventDefault()
      setInitialText(e.key)
      setStep('input')
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [step, highlightElement, editAnnotation])

  useEffect(() => {
    if (!highlightElement) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const rect = highlightElement.getBoundingClientRect()
      const toolbarTop = Math.max(4, rect.top - 48)

      // The floating menu is transient and dismisses itself when the selection
      // scrolls away; an open comment input has to survive so its text isn't lost.
      if ((rect.bottom < 0 || rect.top > window.innerHeight) && step === 'menu') {
        onClose()
        return
      }

      setPosition({
        top: toolbarTop,
        left: Math.max(80, Math.min(rect.left + rect.width / 2, window.innerWidth - 80))
      })
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [highlightElement, onClose, step])

  if (!highlightElement || !position) {return null}

  const handleTypeSelect = (type) => {
    if (type === 'DELETION') {
      onAnnotate(type)
    } else {
      setStep('input')
    }
  }

  const handleDelete = () => {
    if (editAnnotation && onDelete) {
      onDelete(editAnnotation.id)
    }
  }

  const handlePopoverSubmit = (text) => {
    const type = insertionMode || editAnnotation?.type === 'INSERTION' ? 'INSERTION' : 'COMMENT'
    onAnnotate(type, text)
  }

  const handlePopoverClose = () => {
    if (editAnnotation) {
      onClose()
    } else {
      setStep('menu')
    }
  }

  const linkButton = linkUrl && (
    <>
      <span className="toolbar-divider" />
      <OpenLinkButton linkUrl={linkUrl} onOpenLink={onOpenLink} />
    </>
  )

  return (
    <>
      {step === 'menu' && createPortal(
        <div
          className="annotation-toolbar"
          style={{ top: position.top, left: position.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="toolbar-menu">
            {editAnnotation ? (
                <>
                  <button onClick={handleDelete} className="toolbar-btn toolbar-btn-edit-remove" title="Remove annotation">
                    <TrashIcon />
                    <span className="toolbar-label">Remove</span>
                  </button>
                  <button onClick={() => setStep('input')} className="toolbar-btn toolbar-btn-edit-action" title="Edit comment (Cmd+K)">
                    <PencilIcon />
                    <span className="toolbar-label">{editAnnotation.type === 'COMMENT' || editAnnotation.type === 'INSERTION' ? 'Edit' : 'Comment'}</span>
                  </button>
                  {linkButton}
                  <span className="toolbar-divider" />
                  <button onClick={onClose} className="toolbar-btn toolbar-btn-cancel" title="Close" aria-label="Close">
                    <CloseIcon />
                  </button>
                </>
              ) : insertionMode ? (
                <>
                  <button onClick={() => setStep('input')} className="toolbar-btn toolbar-btn-insert" title="Insert text here">
                    <PlusIcon />
                    <span className="toolbar-label">Insert</span>
                  </button>
                  <span className="toolbar-divider" />
                  <button onClick={onClose} className="toolbar-btn toolbar-btn-cancel" title="Cancel" aria-label="Cancel">
                    <CloseIcon />
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => handleTypeSelect('DELETION')} className="toolbar-btn toolbar-btn-delete" title="Delete (Cmd+D)">
                    <TrashIcon />
                    <span className="toolbar-label">Delete</span>
                  </button>
                  <button onClick={() => handleTypeSelect('COMMENT')} className="toolbar-btn toolbar-btn-comment" title="Comment (Cmd+K)">
                    <CommentIcon />
                    <span className="toolbar-label">Comment</span>
                  </button>
                  <button onClick={() => setLabelPickerOpen(true)} className="toolbar-btn toolbar-btn-label" title="Quick label (Alt+1-0)">
                    <TagIcon />
                    <span className="toolbar-label">Label</span>
                  </button>
                  {linkButton}
                  <span className="toolbar-divider" />
                  <button onClick={onClose} className="toolbar-btn toolbar-btn-cancel" title="Cancel" aria-label="Cancel">
                    <CloseIcon />
                  </button>
                </>
              )}
          </div>
        </div>,
        document.body
      )}

      {step === 'input' && (
        <CommentPopover
          anchorEl={highlightElement}
          initialText={initialText}
          placeholder={insertionMode ? 'Text to insert...' : 'Add a comment...'}
          submitLabel={editAnnotation ? 'Save' : 'Add'}
          onSubmit={handlePopoverSubmit}
          onClose={handlePopoverClose}
        />
      )}

      {labelPickerOpen && step === 'menu' && (
        <QuickLabelPicker
          anchorEl={highlightElement}
          onSelect={(label) => {
            setLabelPickerOpen(false)
            onQuickLabel?.(label)
          }}
          onClose={() => setLabelPickerOpen(false)}
        />
      )}
    </>
  )
}
