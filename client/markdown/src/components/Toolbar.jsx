import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CommentPopover } from './CommentPopover.jsx'
import { QuickLabelPicker } from './QuickLabelPicker.jsx'
import { CloseIcon } from '../../../shared/components/CloseIcon.jsx'
import { MOD } from '../../../shared/components/SettingsModal.jsx'
import { useRovingFocus } from '../../../shared/hooks/useRovingFocus.js'
import { TrashIcon, PencilIcon, CommentIcon, PlusIcon, ExternalLinkIcon, FileIcon, TagIcon } from './Icons.jsx'

const IS_MAC = MOD === '⌘'
const modKey = (key) => (IS_MAC ? `⌘${key}` : `Ctrl+${key}`)
const LABEL_KEYS = IS_MAC ? '⌥1–0' : 'Alt+1–0'

/** One action of the selection bar: icon, word and, when it has one, its key as a hint. */
function BarButton({ icon, label, hint, shortcut, ariaLabel, title, onClick }) {
  return (
    <button
      type="button"
      data-dock-item
      className="selection-bar-btn"
      title={title}
      aria-label={ariaLabel}
      aria-keyshortcuts={shortcut}
      onClick={onClick}
    >
      {icon}
      {label && <span className="selection-bar-label">{label}</span>}
      {hint && <kbd className="selection-bar-key" aria-hidden="true">{hint}</kbd>}
    </button>
  )
}

const OpenLinkButton = ({ linkUrl, onOpenLink }) => {
  const isInternal = !!onOpenLink
  return (
    <BarButton
      icon={isInternal ? <FileIcon /> : <ExternalLinkIcon />}
      label="Open"
      title={isInternal ? 'Open file' : 'Open link'}
      onClick={() => isInternal ? onOpenLink(linkUrl) : window.open(linkUrl, '_blank', 'noopener,noreferrer')}
    />
  )
}

export function Toolbar({ highlightElement, onAnnotate, onClose, onDelete, onQuickLabel, requestedStep: requestedStepProp, editAnnotation, elementMode, insertionMode, linkUrl, onOpenLink }) {
  const [step, setStep] = useState('menu')
  const [initialText, setInitialText] = useState('')
  const [position, setPosition] = useState(null)
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)
  const roving = useRovingFocus()

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

  let composerTitle = 'Comment on selection'
  if (editAnnotation) { composerTitle = 'Edit comment' } else if (insertionMode) { composerTitle = 'Text to insert' }

  const linkButton = linkUrl && <OpenLinkButton linkUrl={linkUrl} onOpenLink={onOpenLink} />
  const divider = <span className="selection-bar-divider" aria-hidden="true" />
  const closeButton = (label) => <BarButton icon={<CloseIcon />} ariaLabel={label} title={label} onClick={onClose} />

  let actions
  if (editAnnotation) {
    const hasText = editAnnotation.type === 'COMMENT' || editAnnotation.type === 'INSERTION'
    actions = (
      <>
        <BarButton icon={<TrashIcon />} label="Remove" title="Remove annotation" onClick={handleDelete} />
        <BarButton icon={<PencilIcon />} label={hasText ? 'Edit' : 'Comment'} hint={modKey('K')} shortcut={IS_MAC ? 'Meta+K' : 'Control+K'} onClick={() => setStep('input')} />
        {linkButton}
        {divider}
        {closeButton('Close')}
      </>
    )
  } else if (insertionMode) {
    actions = (
      <>
        <BarButton icon={<PlusIcon />} label="Insert" title="Insert text here" onClick={() => setStep('input')} />
        {divider}
        {closeButton('Cancel')}
      </>
    )
  } else {
    actions = (
      <>
        <BarButton icon={<TrashIcon />} label="Delete" hint={modKey('D')} shortcut={IS_MAC ? 'Meta+D' : 'Control+D'} onClick={() => handleTypeSelect('DELETION')} />
        <BarButton icon={<CommentIcon />} label="Comment" hint={modKey('K')} shortcut={IS_MAC ? 'Meta+K' : 'Control+K'} onClick={() => handleTypeSelect('COMMENT')} />
        <BarButton icon={<TagIcon />} label="Label" hint={LABEL_KEYS} title="Quick label" onClick={() => setLabelPickerOpen(true)} />
        {linkButton}
        {divider}
        {closeButton('Cancel')}
      </>
    )
  }

  return (
    <>
      {step === 'menu' && createPortal(
        <div
          ref={roving.ref}
          className="annotation-toolbar selection-bar"
          role="toolbar"
          aria-label="Selection"
          style={{ top: position.top, left: position.left }}
          onMouseDown={(e) => e.stopPropagation()}
          onFocus={roving.onFocus}
          onKeyDown={roving.onKeyDown}
        >
          {actions}
        </div>,
        document.body
      )}

      {step === 'input' && (
        <CommentPopover
          anchorEl={highlightElement}
          title={composerTitle}
          initialText={initialText}
          draftBaseline={editAnnotation ? initialText : ''}
          placeholder={insertionMode ? 'Text to insert…' : 'Add a comment…'}
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
