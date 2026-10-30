import { useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileRefsContext } from './fileRefsContext.js'
import { previewLines } from '../../utils/fileLineRefs.js'

const EDGE = 8
// Long enough to cross from the button to the preview, which stays open while the pointer is on it.
const LEAVE_DELAY_MS = 150

export function FileLineRef({ reference, label, code = false }) {
  const refs = useContext(FileRefsContext)
  const id = useId()
  const buttonRef = useRef(null)
  const cardRef = useRef(null)
  const leaveTimer = useRef(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [place, setPlace] = useState({ top: 0, left: 0 })
  const open = (hovered || focused) && !dismissed
  const { path, start, end } = reference
  const preview = useMemo(() => (open ? previewLines(refs.diffOf(path), start, end) : null), [open, refs, path, start, end])

  const enter = () => {
    clearTimeout(leaveTimer.current)
    setDismissed(false)
    setHovered(true)
  }
  const leave = () => {
    leaveTimer.current = setTimeout(() => setHovered(false), LEAVE_DELAY_MS)
  }
  useEffect(() => () => clearTimeout(leaveTimer.current), [])

  // Escape works without focus too, a preview opened by the pointer has no key to listen to otherwise.
  useEffect(() => {
    if (!open) { return undefined }
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') { return }
      e.stopPropagation()
      setDismissed(true)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open])

  // Fixed at the button and kept inside the window: a card of the walkthrough clips whatever hangs out of it.
  const placeCard = useCallback(() => {
    const card = cardRef.current
    if (!buttonRef.current || !card) { return }
    const rect = buttonRef.current.getBoundingClientRect()
    const fitsBelow = rect.bottom + card.offsetHeight + EDGE <= window.innerHeight
    setPlace({
      top: fitsBelow ? rect.bottom : Math.max(EDGE, rect.top - card.offsetHeight),
      left: Math.max(EDGE, Math.min(rect.left, window.innerWidth - card.offsetWidth - EDGE))
    })
  }, [])
  useLayoutEffect(() => {
    if (!open) { return undefined }
    placeCard()
    window.addEventListener('scroll', placeCard, true)
    window.addEventListener('resize', placeCard)
    return () => {
      window.removeEventListener('scroll', placeCard, true)
      window.removeEventListener('resize', placeCard)
    }
  }, [open, placeCard])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`file-line-ref-link${code ? ' inline-code' : ''}`}
        aria-describedby={open ? id : undefined}
        onClick={() => refs.jump(path)}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={() => { setDismissed(false); setFocused(true) }}
        onBlur={() => setFocused(false)}
      >
        {label}
      </button>
      {open && createPortal(
        <span id={id} ref={cardRef} role="tooltip" className="file-line-ref-card" style={place} onMouseEnter={enter} onMouseLeave={leave}>
          <span className="file-line-ref-title">{label}</span>
          {preview.covered ? preview.lines.map((line) => (
            <span key={line.no} className={`file-line-ref-line${line.no >= start && line.no <= end ? ' is-target' : ''}`}>
              <span className="file-line-ref-no">{line.no}</span>
              <code>{line.text || ' '}</code>
            </span>
          )) : (
            <span className="file-line-ref-note">Line {start} is not part of the diff. A click shows the file.</span>
          )}
          {preview.more > 0 && <span className="file-line-ref-note">… {preview.more} more {preview.more === 1 ? 'line' : 'lines'}</span>}
        </span>,
        document.body
      )}
    </>
  )
}
