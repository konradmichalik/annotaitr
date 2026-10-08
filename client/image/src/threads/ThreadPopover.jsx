import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOutsideClick } from '../../../shared/hooks/useOutsideClick.js'
import { useModalDismiss } from '../../../shared/hooks/useModalDismiss.js'
import { TOOL_ICONS } from '../utils/icons.jsx'
import ReplyList from '../../../shared/components/ReplyList.jsx'
import ReplyForm from './ReplyForm.jsx'
import { removeReply } from './replyApi.js'
import { STATUS_DISPLAY, AUTHOR_LABELS, threadTitle, threadRound, threadNumber } from './threadView.js'

const POPOVER_WIDTH = 320
const GAP = 12
const MARGIN = 16
const MIN_HEIGHT = 120

/**
 * Below the anchor when the content fits there or there is more room below than above, else above.
 * The popover is capped to the room on its side, the body scrolls inside that cap.
 */
function computeLayout(anchorPoint, naturalHeight) {
  let left = anchorPoint.x - POPOVER_WIDTH / 2
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - POPOVER_WIDTH - MARGIN))

  const spaceBelow = window.innerHeight - anchorPoint.y - GAP - MARGIN
  const spaceAbove = anchorPoint.y - GAP - MARGIN
  const below = naturalHeight <= spaceBelow || spaceBelow >= spaceAbove
  const maxHeight = Math.max(MIN_HEIGHT, below ? spaceBelow : spaceAbove)

  return {
    maxHeight,
    left,
    ...(below ? { top: anchorPoint.y + GAP } : { bottom: window.innerHeight - anchorPoint.y + GAP })
  }
}

export function ThreadPopoverContent({ thread, round, onReload }) {
  const [error, setError] = useState(null)
  const fieldRef = useRef(null)
  const removingRef = useRef(false)

  const handleRemove = async (reply) => {
    if (removingRef.current) { return }
    removingRef.current = true
    const result = await removeReply(thread.handle, reply.id)
    removingRef.current = false
    setError(result.error ?? null)
    // The Remove button unmounts with the reply, so focus would drop to the page.
    fieldRef.current?.focus()
    onReload()
  }

  return (
    <>
      <div className="thread-popover-body">
        <h2 className="thread-popover-title">
          {threadTitle(thread, round)}
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
          ? <ReplyList
              replies={thread.replies} display={STATUS_DISPLAY} labels={AUTHOR_LABELS}
              pendingLabel="pending, sent with your decision" onRemove={onReload && handleRemove}
            />
          : <p className="thread-popover-empty">No reply from the agent yet.</p>}
      </div>
      {/* Outside the scrolling body, so the field stays in reach however long the thread gets. */}
      {onReload && (
        <div className="thread-popover-footer">
          <ReplyForm handle={thread.handle} error={error} onError={setError} fieldRef={fieldRef} onSent={onReload} />
        </div>
      )}
    </>
  )
}

export default function ThreadPopover({ thread, round, anchorPoint, onClose, onReload }) {
  const popoverRef = useRef(null)
  useOutsideClick(popoverRef, onClose)
  // The owner puts focus back on whatever opened the visible popover; a restore of its own would return to the one before a switch.
  useModalDismiss(true, onClose, popoverRef, { restoreFocus: false })

  // The real height is only known after rendering, and it changes as the thread grows, so the placement is measured before paint.
  const { x: anchorX, y: anchorY } = anchorPoint
  const [layout, setLayout] = useState(() => computeLayout(anchorPoint, 0))
  const [viewportTick, setViewportTick] = useState(0)
  useLayoutEffect(() => {
    const onResize = () => setViewportTick((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useLayoutEffect(() => {
    const el = popoverRef.current
    const body = el.querySelector('.thread-popover-body')
    const footer = el.querySelector('.thread-popover-footer')
    const natural = body.scrollHeight + (footer?.offsetHeight ?? 0) + el.offsetHeight - el.clientHeight
    setLayout(computeLayout({ x: anchorX, y: anchorY }, natural))
  }, [thread, anchorX, anchorY, viewportTick])

  return createPortal(
    <div
      ref={popoverRef}
      className="comment-popover thread-popover"
      role="dialog"
      aria-label={`Round ${threadRound(thread, round)}, mark ${threadNumber(thread)}`}
      tabIndex={-1}
      style={{ ...layout, width: POPOVER_WIDTH }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <ThreadPopoverContent thread={thread} round={round} onReload={onReload} />
    </div>,
    document.body
  )
}
