import { useState, useEffect, useId, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useFileAutocomplete } from '../hooks/useFileAutocomplete.js'
import { FileAutocomplete } from './FileAutocomplete.jsx'
import { TextareaBackdrop } from './TextareaBackdrop.jsx'
import { getOffscreenSide } from '../utils/popoverVisibility.js'
import { Composer } from '../../../shared/components/Composer.jsx'
import { ExpandIcon } from '../../../shared/components/HeaderIcons.jsx'
import { hasDraft } from '../../../shared/utils/composerDraft.js'

const POPOVER_WIDTH = 320
const GAP = 8

function computePosition(anchorRect) {
  const spaceBelow = window.innerHeight - anchorRect.bottom
  const flipAbove = spaceBelow < 280

  const top = flipAbove
    ? anchorRect.top - GAP
    : anchorRect.bottom + GAP

  let left = anchorRect.left + anchorRect.width / 2 - POPOVER_WIDTH / 2
  left = Math.max(16, Math.min(left, window.innerWidth - POPOVER_WIDTH - 16))

  return { top, left, flipAbove }
}

/**
 * The comment composer on a text selection. `draftBaseline` is the text it
 * counts as untouched: the stored comment when editing, nothing for a new one
 * (even when typing a key opened it with that key already in the field).
 */
export function CommentPopover({
  anchorEl,
  title = 'Comment on selection',
  initialText = '',
  draftBaseline = '',
  placeholder = 'Add a comment…',
  submitLabel = 'Save',
  onSubmit,
  onClose,
}) {
  const [mode, setMode] = useState('popover')
  const [text, setText] = useState(initialText)
  const [cursorPos, setCursorPos] = useState(initialText.length)
  const [position, setPosition] = useState(null)
  const [offscreenSide, setOffscreenSide] = useState(null)
  const textareaRef = useRef(null)
  const popoverRef = useRef(null)
  const titleId = useId()

  const hasText = text.trim().length > 0
  const autocomplete = useFileAutocomplete(text, cursorPos)

  const applyAutocomplete = (index) => {
    autocomplete.applyAccept(index, setText, setCursorPos, textareaRef)
  }

  // Track anchor position (popover mode only)
  useEffect(() => {
    if (mode !== 'popover' || !anchorEl) {return}

    const update = () => {
      setPosition(computePosition(anchorEl.getBoundingClientRect()))
    }

    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorEl, mode])

  // Focus the field once it is rendered (an anchored popover renders only after its position is known) and on mode changes.
  const rendered = mode === 'dialog' || position !== null
  useEffect(() => {
    if (!rendered) {return}
    const id = setTimeout(() => {
      const el = textareaRef.current
      if (el) {
        el.focus()
        el.selectionStart = el.selectionEnd = el.value.length
      }
    }, 0)
    return () => clearTimeout(id)
  }, [mode, rendered])

  // Track whether the popover has scrolled out of view (anchored mode only)
  useEffect(() => {
    if (mode !== 'popover') {
      setOffscreenSide(null)
      return
    }

    const update = () => {
      const el = popoverRef.current
      if (!el) {return}
      const side = getOffscreenSide(el.getBoundingClientRect(), window.innerHeight)
      setOffscreenSide((prev) => (prev === side ? prev : side))
    }

    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [mode])

  const scrollBackToPopover = useCallback(() => {
    if (!anchorEl) {return}
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    anchorEl.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [anchorEl])

  const handleSubmit = useCallback(() => {
    if (text.trim()) {
      onSubmit(text)
    }
  }, [text, onSubmit])

  // Accepting a suggestion takes Enter and Tab, the composer around the field handles Escape and ⌘↵.
  const handleKeyDown = (e) => {
    if (autocomplete.handleKeyDown(e) === 'accept') {
      applyAutocomplete()
    }
  }

  const expandButton = mode === 'popover' ? (
    <button
      type="button"
      className="composer-icon-button"
      onClick={() => setMode('dialog')}
      title="Expand"
      aria-label="Expand comment editor"
    >
      <ExpandIcon size={14} />
    </button>
  ) : null

  const isDialog = mode === 'dialog'
  // Escape in the expanded editor only collapses it. The field it leaves is gone by the time the
  // viewer's own Escape handler runs, which would otherwise close the whole selection as well.
  const collapse = (event) => {
    event.stopPropagation()
    setMode('popover')
  }
  if (!isDialog && !position) {return null}

  const popoverStyle = isDialog ? undefined : {
    top: position.flipAbove ? undefined : position.top,
    bottom: position.flipAbove ? (window.innerHeight - position.top) : undefined,
    left: position.left,
    width: POPOVER_WIDTH,
  }

  const composer = (
    <Composer
      rootRef={popoverRef}
      title={title}
      titleId={titleId}
      className={isDialog ? 'comment-popover--dialog' : ''}
      style={popoverStyle}
      dirty={hasDraft(text, draftBaseline)}
      submitLabel={submitLabel}
      submitDisabled={!hasText}
      tools={expandButton}
      onSave={handleSubmit}
      onDiscard={onClose}
      onEscape={isDialog ? collapse : onClose}
    >
      <div className="comment-popover-body">
        <div className="textarea-backdrop-wrap">
          <TextareaBackdrop value={text} textareaRef={textareaRef} />
          <textarea
            ref={textareaRef}
            className={`comment-popover-textarea ${isDialog ? 'comment-popover-textarea--expanded' : ''}`}
            placeholder={placeholder}
            aria-labelledby={titleId}
            value={text}
            aria-expanded={autocomplete.isOpen}
            aria-autocomplete="list"
            onChange={(e) => {
              setText(e.target.value)
              setCursorPos(e.target.selectionStart)
            }}
            onSelect={(e) => setCursorPos(e.target.selectionStart)}
            onKeyDown={handleKeyDown}
          />
        </div>
        {autocomplete.isOpen && (
          <FileAutocomplete
            items={autocomplete.items}
            activeIndex={autocomplete.activeIndex}
            onSelect={applyAutocomplete}
          />
        )}
      </div>
    </Composer>
  )

  if (isDialog) {
    return createPortal(<div className="comment-popover-overlay">{composer}</div>, document.body)
  }

  return createPortal(
    <>
      {composer}
      {offscreenSide && (
        <button
          type="button"
          className={`comment-offscreen-pill comment-offscreen-pill--${offscreenSide}`}
          onClick={scrollBackToPopover}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={offscreenSide === 'above' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
            />
          </svg>
          Open comment
        </button>
      )}
    </>,
    document.body
  )
}
