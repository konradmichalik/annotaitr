import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useOutsideClick } from '../../../shared/hooks/useOutsideClick.js'
import { useModalDismiss } from '../../../shared/hooks/useModalDismiss.js'
import { TOOL_ICONS } from '../utils/icons.jsx'
import ReplyList from '../../../shared/components/ReplyList.jsx'
import { STATUS_DISPLAY, AUTHOR_LABELS } from './threadView.js'

const POPOVER_WIDTH = 320
const POPOVER_HEIGHT_ESTIMATE = 150
const GAP = 12

/** Below the anchor by default, flipping above only when there is no room below. */
function computePosition(anchorPoint) {
  let left = anchorPoint.x - POPOVER_WIDTH / 2
  left = Math.max(16, Math.min(left, window.innerWidth - POPOVER_WIDTH - 16))

  const spaceBelow = window.innerHeight - anchorPoint.y
  const flipAbove = spaceBelow < POPOVER_HEIGHT_ESTIMATE + GAP

  return flipAbove
    ? { bottom: window.innerHeight - anchorPoint.y + GAP, left }
    : { top: anchorPoint.y + GAP, left }
}

export function ThreadPopoverContent({ thread, round }) {
  return (
    <>
      <h2 className="thread-popover-title">
        Round {round} · mark {thread.number}
        {thread.handle && <span className="thread-popover-handle">#{thread.handle}</span>}
      </h2>
      {thread.anchor === 'ghost' && thread.reason && <p className="thread-popover-note">{thread.reason}</p>}
      {thread.element && (
        <p className="comment-popover-element" title={thread.element}>
          {TOOL_ICONS.element}
          <span className="comment-popover-element-name">{thread.element}</span>
        </p>
      )}
      <blockquote className="thread-popover-quote">
        <span className="thread-popover-author">{AUTHOR_LABELS.human}</span>
        <p className="thread-popover-text">{thread.annotation.text}</p>
      </blockquote>
      {thread.replies.length > 0
        ? <ReplyList replies={thread.replies} display={STATUS_DISPLAY} labels={AUTHOR_LABELS} />
        : <p className="thread-popover-empty">No reply from the agent yet.</p>}
    </>
  )
}

export default function ThreadPopover({ thread, round, anchorPoint, onClose }) {
  const popoverRef = useRef(null)
  useOutsideClick(popoverRef, onClose)
  // The owner puts focus back on whatever opened the visible popover; a restore of its own would return to the one before a switch.
  useModalDismiss(true, onClose, popoverRef, { restoreFocus: false })

  return createPortal(
    <div
      ref={popoverRef}
      className="comment-popover thread-popover"
      role="dialog"
      aria-label={`Round ${round}, mark ${thread.number}`}
      tabIndex={-1}
      style={{ ...computePosition(anchorPoint), width: POPOVER_WIDTH }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="thread-popover-body">
        <ThreadPopoverContent thread={thread} round={round} />
      </div>
    </div>,
    document.body
  )
}
