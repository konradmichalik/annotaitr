import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CommentPopover } from './CommentPopover.jsx'
import { QuickLabelPicker } from './QuickLabelPicker.jsx'
import { CloseIcon } from '../../../shared/components/CloseIcon.jsx'
import { MOD } from '../../../shared/utils/keys.js'
import { useRovingFocus } from '../../../shared/hooks/useRovingFocus.js'
import { TrashIcon, PencilIcon, ExternalLinkIcon, FileIcon, TagIcon } from './Icons.jsx'
import { IntentIcon } from '../../../shared/components/IntentIcon.jsx'
import { intentOf } from '../../../shared/utils/intents.js'

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

/**
 * The bar over a selection: Comment and Remove, Label and Open. Typing
 * starts a comment at once, `⌫` marks the selection for removal, so the bar
 * only has to be read, never used. Either way a comment composer follows.
 */
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
      setStep(requestedStepProp ? 'input' : 'menu')
      setInitialText('')
    } else if (requestedStepProp) {
      setStep('input')
      setInitialText('')
    } else {
      setStep('menu')
      setInitialText('')
    }
  }, [highlightElement, requestedStepProp, editAnnotation, elementMode, insertionMode])

  const openComposer = (text = '') => {
    setInitialText(text)
    setStep('input')
  }

  // ⌫ marks the selection for removal, any printable key starts a comment with that key. ⌫ on a
  // button of the bar or in the label picker belongs to that control, not to the selection.
  useEffect(() => {
    if (step !== 'menu' || !highlightElement || editAnnotation || insertionMode) {return}
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'textarea' || tag === 'input') {return}
      if (e.metaKey || e.ctrlKey || e.altKey) {return}
      if (e.key === 'Backspace') {
        if (tag === 'button' || labelPickerOpen) {return}
        e.preventDefault()
        onAnnotate('DELETION')
        return
      }
      if (e.key.length !== 1) {return}
      e.preventDefault()
      openComposer(e.key)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [step, highlightElement, editAnnotation, insertionMode, onAnnotate, labelPickerOpen])

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

  const handleDelete = () => {
    if (editAnnotation && onDelete) {
      onDelete(editAnnotation.id)
    }
  }

  const isInsertion = insertionMode || editAnnotation?.type === 'INSERTION'

  // A comment added to a removal is still a removal, which the type alone no longer says.
  const keptKind = editAnnotation && intentOf(editAnnotation) === 'remove' ? 'remove' : undefined

  const handlePopoverSubmit = (text, attachments) => {
    onAnnotate(isInsertion ? 'INSERTION' : 'COMMENT', text, undefined, keptKind, attachments)
  }

  const handlePopoverClose = () => {
    if (editAnnotation) {
      onClose()
    } else {
      setStep('menu')
    }
  }

  let composerTitle = 'Comment on selection'
  if (editAnnotation) { composerTitle = 'Edit comment' } else if (insertionMode) { composerTitle = 'Comment at this position' }

  const linkButton = linkUrl && <OpenLinkButton linkUrl={linkUrl} onOpenLink={onOpenLink} />
  const divider = <span className="selection-bar-divider" aria-hidden="true" />
  const closeButton = (label) => <BarButton icon={<CloseIcon />} ariaLabel={label} title={label} onClick={onClose} />

  let actions
  if (editAnnotation) {
    const hasText = editAnnotation.type === 'COMMENT' || editAnnotation.type === 'INSERTION'
    actions = (
      <>
        <BarButton icon={<TrashIcon />} label="Delete" title="Delete annotation" onClick={handleDelete} />
        <BarButton icon={<PencilIcon />} label={hasText ? 'Edit' : 'Comment'} hint={modKey('K')} shortcut={IS_MAC ? 'Meta+K' : 'Control+K'} onClick={() => setStep('input')} />
        {linkButton}
        {divider}
        {closeButton('Close')}
      </>
    )
  } else if (insertionMode) {
    actions = (
      <>
        <BarButton icon={<IntentIcon intent="comment" />} label="Comment" title="Comment at this position" onClick={() => setStep('input')} />
        {divider}
        {closeButton('Cancel')}
      </>
    )
  } else {
    actions = (
      <>
        <BarButton icon={<IntentIcon intent="comment" />} label="Comment" hint={modKey('K')} shortcut={IS_MAC ? 'Meta+K' : 'Control+K'} title={`Comment (type, or ${modKey('K')})`} onClick={() => openComposer()} />
        <BarButton icon={<IntentIcon intent="remove" />} label="Remove" hint="⌫" shortcut={`Backspace ${IS_MAC ? 'Meta+D' : 'Control+D'}`} title={`Remove (⌫ or ${modKey('D')})`} onClick={() => onAnnotate('DELETION')} />
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
          placeholder="Add a comment…"
          submitLabel={editAnnotation ? 'Save' : 'Add'}
          initialAttachments={editAnnotation?.attachments}
          attachable={!isInsertion}
          onRemove={editAnnotation || isInsertion ? null : () => onAnnotate('DELETION')}
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
