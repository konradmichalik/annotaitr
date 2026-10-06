import { useEffect, useId, useRef, useState } from 'react'
import { formatTimecode } from './timeline.js'
import { TOOL_ICONS, ACTION_ICONS, PLAYER_ICONS } from '../utils/icons.jsx'

// Long enough that passing over the group on the way elsewhere opens nothing.
const OPEN_DELAY_MS = 400
const CLOSE_DELAY_MS = 150

function ClearSpanButton({ onClick }) {
  return (
    <button type="button" className="timeline-icon-btn" onClick={onClick} aria-label="Cancel span">
      {ACTION_ICONS.close}
    </button>
  )
}

function IdleHelp() {
  return (
    <>
      <p className="span-help-title">Comment on something that lasts</p>
      <p>A spinner that never stops, a layout that jumps, an animation that stutters.</p>
      <ol>
        <li><strong>Mark span</strong> where it starts</li>
        <li>Move to where it ends, then <strong>Set end here</strong></li>
        <li>Draw on the start frame, or <strong>Comment span</strong> for text only</li>
      </ol>
      <p className="span-help-note">The agent gets the start frame and a strip of frames across the span. Keys: <kbd>I</kbd> and <kbd>O</kbd>.</p>
    </>
  )
}

function StartedHelp({ canEnd }) {
  return (
    <>
      <p className="span-help-title">Now find where it ends</p>
      <p>Play, scrub the timeline or step with <kbd>←</kbd> <kbd>→</kbd>, then click <strong>Set end here</strong> (<kbd>O</kbd>).</p>
      {!canEnd && <p className="span-help-note">The end has to come after the start.</p>}
      <p className="span-help-note"><strong>×</strong> cancels the span.</p>
    </>
  )
}

function CompleteHelp() {
  return (
    <>
      <p className="span-help-title">Say what happens in the span</p>
      <ul>
        <li><strong>Pin</strong>, or any tool in the toolbar, then click the frame: marks something in it</li>
        <li><strong>Comment span</strong>: text only, nothing drawn</li>
      </ul>
      <p className="span-help-note">The player is on the span's start frame. Moving away first turns the next drawing into a single moment.</p>
    </>
  )
}

/**
 * Shows on hover and on keyboard focus, stays open while the pointer is over
 * it, and closes on Escape (WCAG 1.4.13). Native titles are not used here:
 * they appear late, cannot be styled and never show on focus.
 */
function useHoverHelp() {
  const [open, setOpen] = useState(false)
  const timerRef = useRef(null)

  const schedule = (next, delay) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setOpen(next), delay)
  }

  useEffect(() => () => clearTimeout(timerRef.current), [])

  useEffect(() => {
    if (!open) { return }
    const onKeyDown = (event) => { if (event.key === 'Escape') { setOpen(false) } }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return {
    open,
    handlers: {
      onPointerEnter: () => schedule(true, OPEN_DELAY_MS),
      onPointerLeave: () => schedule(false, CLOSE_DELAY_MS),
      onFocus: () => schedule(true, 0),
      onBlur: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) { schedule(false, 0) }
      }
    }
  }
}

/**
 * Marking a span is a guided flow, so each state names its next step:
 * idle -> start set (move on, then set the end) -> complete (draw on the
 * start frame or comment without drawing). The help explains the current
 * state in more words than fit in the bar.
 */
export default function SpanControls({ range, currentTime, activeTool, onPickTool, onMarkStart, onMarkEnd, onClearRange, onCommentRange }) {
  const helpId = useId()
  const { open, handlers } = useHoverHelp()
  const started = range.start !== null
  const complete = started && range.end !== null
  const canEnd = started && currentTime > range.start

  let help = <IdleHelp />
  let controls = (
    <button type="button" className="timeline-chip" onClick={onMarkStart}>
      {PLAYER_ICONS.span}Mark span<kbd>I</kbd>
    </button>
  )

  if (complete) {
    help = <CompleteHelp />
    controls = (
      <>
        <span className="timeline-span-text">
          <strong>{formatTimecode(range.start)}</strong> → <strong>{formatTimecode(range.end)}</strong>
        </span>
        <button
          type="button"
          className="timeline-chip"
          aria-label="Pin in span"
          aria-pressed={activeTool === 'pin'}
          onClick={() => onPickTool('pin')}
        >
          {TOOL_ICONS.pin}Pin
        </button>
        <button type="button" className="timeline-chip timeline-chip--primary" onClick={onCommentRange}>
          Comment span
        </button>
        <ClearSpanButton onClick={onClearRange} />
      </>
    )
  } else if (started) {
    help = <StartedHelp canEnd={canEnd} />
    controls = (
      <>
        <span className="timeline-span-text">From <strong>{formatTimecode(range.start)}</strong></span>
        <button type="button" className="timeline-chip timeline-chip--primary" onClick={onMarkEnd} disabled={!canEnd}>
          Set end here<kbd>O</kbd>
        </button>
        <ClearSpanButton onClick={onClearRange} />
      </>
    )
  }

  return (
    <div
      className={`timeline-span${started ? ' timeline-span--active' : ''}`}
      role="group"
      aria-label="Span"
      aria-describedby={helpId}
      {...handlers}
    >
      {controls}
      <div id={helpId} role="tooltip" className="span-help" hidden={!open}>
        {help}
      </div>
    </div>
  )
}
