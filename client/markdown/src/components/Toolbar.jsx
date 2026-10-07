import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CommentPopover } from './CommentPopover.jsx'
import { QuickLabelPicker } from './QuickLabelPicker.jsx'
import { CloseIcon } from '../../../shared/components/CloseIcon.jsx'
import { MOD } from '../../../shared/components/SettingsModal.jsx'
import { useRovingFocus } from '../../../shared/hooks/useRovingFocus.js'
import { TrashIcon, PencilIcon, PlusIcon, ExternalLinkIcon, FileIcon, TagIcon } from './Icons.jsx'
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

// The selection bar's keys: the four intents in the order the composer's chip lists them.
const BAR_KEYS = { 1: 'change', 2: 'add', 3: 'remove', 4: 'question' }

/**
 * The bar over a selection: Change, Add, Remove and Ask (keys 1 to 4), Label
 * and Open, then the composer. `onAddAfter` inserts text after a text
 * selection; without it (an element, a token, the source view) Add is not offered.
 */
export function Toolbar({ highlightElement, onAnnotate, onAddAfter = null, onClose, onDelete, onQuickLabel, requestedStep: requestedStepProp, editAnnotation, elementMode, insertionMode, linkUrl, onOpenLink }) {
  const [step, setStep] = useState('menu')
  const [initialText, setInitialText] = useState('')
  const [intent, setIntent] = useState('change')
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
      setIntent(intentOf(editAnnotation) ?? 'change')
    } else if (insertionMode) {
      // Add on a selection opens the field for the new text straight away.
      setStep(requestedStepProp ? 'input' : 'menu')
      setInitialText('')
    } else if (requestedStepProp) {
      setStep('input')
      setInitialText('')
      setIntent('change')
    } else {
      setStep('menu')
      setInitialText('')
      setIntent('change')
    }
  }, [highlightElement, requestedStepProp, editAnnotation, elementMode, insertionMode])

  const openComposer = (nextIntent, text = '') => {
    setIntent(nextIntent)
    setInitialText(text)
    setStep('input')
  }

  // Keys 1 to 4 pick an intent, any other printable key starts a Change comment with that key.
  useEffect(() => {
    if (step !== 'menu' || !highlightElement || editAnnotation || insertionMode) {return}
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'textarea' || tag === 'input') {return}
      if (e.metaKey || e.ctrlKey || e.altKey) {return}
      if (e.key.length !== 1) {return}
      const picked = BAR_KEYS[e.key]
      if (picked === 'add' && !onAddAfter) {return}
      e.preventDefault()
      if (picked === 'remove') { onAnnotate('DELETION') }
      else if (picked === 'add') { onAddAfter() }
      else { openComposer(picked ?? 'change', picked ? '' : e.key) }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [step, highlightElement, editAnnotation, insertionMode, onAddAfter, onAnnotate])

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

  const handlePopoverSubmit = (text, pickedIntent) => {
    onAnnotate(isInsertion ? 'INSERTION' : 'COMMENT', text, undefined, pickedIntent)
  }

  const handlePopoverClose = () => {
    if (editAnnotation) {
      onClose()
    } else {
      setStep('menu')
    }
  }

  let composerTitle = intent === 'question' ? 'Question on selection' : 'Comment on selection'
  if (editAnnotation) { composerTitle = 'Edit comment' } else if (insertionMode) { composerTitle = 'Text to insert' }

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
        <BarButton icon={<PlusIcon />} label="Add" title="Add text here" onClick={() => setStep('input')} />
        {divider}
        {closeButton('Cancel')}
      </>
    )
  } else {
    actions = (
      <>
        <BarButton icon={<IntentIcon intent="change" />} label="Change" hint="1" shortcut={`1 ${IS_MAC ? 'Meta+K' : 'Control+K'}`} title={`Change (1 or ${modKey('K')})`} onClick={() => openComposer('change')} />
        {onAddAfter && <BarButton icon={<IntentIcon intent="add" />} label="Add" hint="2" shortcut="2" title="Add text after the selection (2)" onClick={onAddAfter} />}
        <BarButton icon={<IntentIcon intent="remove" />} label="Remove" hint="3" shortcut={`3 ${IS_MAC ? 'Meta+D' : 'Control+D'}`} title={`Remove (3 or ${modKey('D')})`} onClick={() => onAnnotate('DELETION')} />
        <BarButton icon={<IntentIcon intent="question" />} label="Ask" hint="4" shortcut="4" title="Ask a question (4)" onClick={() => openComposer('question')} />
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
          initialIntent={isInsertion ? null : intent}
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
