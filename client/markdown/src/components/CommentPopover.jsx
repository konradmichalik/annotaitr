import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useFileAutocomplete } from '../hooks/useFileAutocomplete.js'
import { FileAutocomplete } from './FileAutocomplete.jsx'
import { TextareaBackdrop } from './TextareaBackdrop.jsx'
import { getOffscreenSide } from '../utils/popoverVisibility.js'

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

export function CommentPopover({
  anchorEl,
  initialText = '',
  placeholder = 'Add a comment...',
  submitLabel = 'Save',
  onSubmit,
  onClose,
}) {
  const [mode, setMode] = useState('popover')
  const [text, setText] = useState(initialText)
  const [cursorPos, setCursorPos] = useState(initialText.length)
  const [position, setPosition] = useState(null)
  const [dragOffset, setDragOffset] = useState(null)
  const [offscreenSide, setOffscreenSide] = useState(null)
  const textareaRef = useRef(null)
  const popoverRef = useRef(null)
  const isDragging = useRef(false)

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

  // Focus textarea on mount and mode changes
  useEffect(() => {
    const id = setTimeout(() => {
      const el = textareaRef.current
      if (el) {
        el.focus()
        el.selectionStart = el.selectionEnd = el.value.length
      }
    }, 0)
    return () => clearTimeout(id)
  }, [mode])

  // Click outside to close (popover mode) — a popover holding text stays open so
  // a stray click can't discard it. Escape and Cancel still close explicitly.
  useEffect(() => {
    if (mode !== 'popover' || hasText) {return}

    const handleMouseDown = (e) => {
      if (e.detail >= 2) { return }
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [mode, hasText, onClose])

  // Track whether the popover has scrolled out of view (anchored mode only —
  // a dragged popover is pinned to the viewport and always visible)
  useEffect(() => {
    if (mode !== 'popover' || dragOffset) {
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
  }, [mode, dragOffset])

  const scrollBackToPopover = useCallback(() => {
    if (!anchorEl) {return}
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    anchorEl.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [anchorEl])

  // Drag to reposition (popover mode only)
  const handleDragStart = useCallback((e) => {
    if (mode !== 'popover' || !popoverRef.current) {return}
    e.preventDefault()
    const rect = popoverRef.current.getBoundingClientRect()
    isDragging.current = true
    const startX = e.clientX
    const startY = e.clientY
    const startLeft = rect.left
    const startTop = rect.top
    const maxLeft = Math.max(GAP, window.innerWidth - rect.width - GAP)
    const maxTop = Math.max(GAP, window.innerHeight - rect.height - GAP)

    const handleDragMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      setDragOffset({
        left: Math.max(GAP, Math.min(startLeft + dx, maxLeft)),
        top: Math.max(GAP, Math.min(startTop + dy, maxTop))
      })
    }

    const handleDragEnd = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', handleDragMove)
      document.removeEventListener('mouseup', handleDragEnd)
    }

    document.addEventListener('mousemove', handleDragMove)
    document.addEventListener('mouseup', handleDragEnd)
  }, [mode])

  const handleSubmit = useCallback(() => {
    if (text.trim()) {
      onSubmit(text)
    }
  }, [text, onSubmit])

  const handleKeyDown = (e) => {
    const action = autocomplete.handleKeyDown(e)
    if (action === 'accept') {
      applyAutocomplete()
      return
    }
    if (action) {return}

    if (e.key === 'Escape') {
      e.preventDefault()
      if (mode === 'dialog') {
        setMode('popover')
      } else {
        onClose()
      }
    }

    if (e.key === 'Enter' && !e.nativeEvent?.isComposing && (e.metaKey || e.ctrlKey) && text.trim()) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const dragHandle = mode === 'popover' ? (
    <div
      className="comment-popover-drag-handle"
      onMouseDown={handleDragStart}
      title="Drag to reposition"
    >
      <svg width="16" height="6" viewBox="0 0 16 6" fill="currentColor" aria-hidden="true">
        <circle cx="4" cy="1" r="1" /><circle cx="8" cy="1" r="1" /><circle cx="12" cy="1" r="1" />
        <circle cx="4" cy="5" r="1" /><circle cx="8" cy="5" r="1" /><circle cx="12" cy="5" r="1" />
      </svg>
    </div>
  ) : null

  const textarea = (
    <div className="comment-popover-body">
      <div className="textarea-backdrop-wrap">
        <TextareaBackdrop value={text} textareaRef={textareaRef} />
        <textarea
          ref={textareaRef}
          className={`comment-popover-textarea ${mode === 'dialog' ? 'comment-popover-textarea--expanded' : ''}`}
          placeholder={placeholder}
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
  )

  const footer = (
    <div className="comment-popover-footer">
      <span className="comment-popover-hint">
        {navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to save
      </span>
      <div className="comment-popover-actions">
        {mode === 'popover' && (
          <button
            type="button"
            className="comment-popover-expand-btn"
            onClick={() => setMode('dialog')}
            title="Expand"
            aria-label="Expand comment editor"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h6m0 0v6m0-6L13 11M9 21H3m0 0v-6m0 6l8-8" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="comment-popover-cancel-btn"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="comment-popover-submit-btn"
          disabled={!hasText}
          onClick={handleSubmit}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )

  if (mode === 'dialog') {
    return createPortal(
      <div className="comment-popover-overlay" onMouseDown={hasText ? undefined : onClose}>
        <div
          ref={popoverRef}
          className="comment-popover comment-popover--dialog"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {textarea}
          {footer}
        </div>
      </div>,
      document.body
    )
  }

  if (!position) {return null}

  const popoverStyle = dragOffset
    ? { top: dragOffset.top, left: dragOffset.left, width: POPOVER_WIDTH }
    : {
      top: position.flipAbove ? undefined : position.top,
      bottom: position.flipAbove ? (window.innerHeight - position.top) : undefined,
      left: position.left,
      width: POPOVER_WIDTH,
    }

  return createPortal(
    <>
      <div
        ref={popoverRef}
        className={`comment-popover${dragOffset ? ' comment-popover--dragged' : ''}`}
        style={popoverStyle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {dragHandle}
        {textarea}
        {footer}
      </div>
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
