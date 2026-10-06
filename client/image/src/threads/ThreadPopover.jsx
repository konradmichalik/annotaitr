import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useOutsideClick } from '../../../shared/hooks/useOutsideClick.js'
import { useModalDismiss } from '../../../shared/hooks/useModalDismiss.js'
import { TOOL_ICONS } from '../utils/icons.jsx'
import ReplyList from '../../../shared/components/ReplyList.jsx'
import { STATUS_DISPLAY } from './threadView.js'

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
      <h3 className="thread-popover-heading">Your comment</h3>
      <p className="thread-popover-text">{thread.annotation.text}</p>
      <h3 className="thread-popover-heading">Replies</h3>
      {thread.replies.length > 0
        ? <ReplyList replies={thread.replies} display={STATUS_DISPLAY} />
        : <p className="thread-popover-empty">No reply from the agent yet.</p>}
    </>
  )
}

export default function ThreadPopover({ thread, round, anchorPoint, onClose }) {
  const popoverRef = useRef(null)
  useOutsideClick(popoverRef, onClose)
  useModalDismiss(true, onClose, popoverRef)

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
