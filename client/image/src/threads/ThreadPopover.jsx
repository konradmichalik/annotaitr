import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOutsideClick } from '../../../shared/hooks/useOutsideClick.js'
import { useModalDismiss } from '../../../shared/hooks/useModalDismiss.js'
import { TOOL_ICONS } from '../utils/icons.jsx'
import ReplyList from '../../../shared/components/ReplyList.jsx'
import StatusChip from '../../../shared/components/StatusChip.jsx'
import { CloseIcon } from '../../../shared/components/CloseIcon.jsx'
import ReplyForm from './ReplyForm.jsx'
import { removeReply } from './replyApi.js'
import { STATUS_DISPLAY, AUTHOR_LABELS, AUTHOR_AVATARS, threadTitle, threadRound, threadStatus } from './threadView.js'

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

// The reviewer's note opens the list, so the thread reads top to bottom: note, the agent's answers, the reviewer's replies.
function threadMessages(thread, round) {
  const r = threadRound(thread, round)
  const note = { id: 'note', author: 'human', text: thread.annotation.text, meta: `round ${r}` }
  const replies = thread.replies.map((reply) => ((reply.author ?? 'agent') === 'agent' ? { ...reply, meta: `after round ${r}` } : reply))
  return [note, ...replies]
}

export function ThreadPopoverContent({ thread, round, titleId, onClose, onReload }) {
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
      <div className="thread-popover-header">
        <h2 id={titleId} className="thread-popover-title">{threadTitle(thread, round)}</h2>
        <StatusChip status={threadStatus(thread)} display={STATUS_DISPLAY} />
        {thread.handle && <span className="thread-popover-handle">#{thread.handle}</span>}
        {onClose && (
          <button type="button" className="composer-icon-button thread-popover-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        )}
      </div>
      <div className="thread-popover-body">
        {thread.anchor === 'ghost' && thread.reason && <p className="thread-popover-note">{thread.reason}</p>}
        {thread.element && (
          <p className="comment-popover-element" title={thread.element}>
            {TOOL_ICONS.element}
            <span className="comment-popover-element-name">{thread.element}</span>
          </p>
        )}
        <ReplyList
          replies={threadMessages(thread, round)} display={STATUS_DISPLAY} labels={AUTHOR_LABELS} avatars={AUTHOR_AVATARS}
          pendingLabel="Pending, sent with your decision" onRemove={onReload && handleRemove}
        />
        {thread.replies.length === 0 && <p className="thread-popover-empty">No reply from the agent yet.</p>}
      </div>
      {onReload && <ReplyForm handle={thread.handle} error={error} onError={setError} fieldRef={fieldRef} onSent={onReload} />}
    </>
  )
}

export default function ThreadPopover({ thread, round, anchorPoint, onClose, onReload }) {
  const popoverRef = useRef(null)
  const titleId = useId()
  useOutsideClick(popoverRef, onClose)
  // The owner puts focus back on whatever opened the visible popover; a restore of its own would return to the one before a switch.
  useModalDismiss(true, onClose, popoverRef, { restoreFocus: false })

  // The real height is only known after rendering, and it changes as the thread grows, so the placement is measured before paint.
  const { x: anchorX, y: anchorY } = anchorPoint
  const [layout, setLayout] = useState(() => computeLayout(anchorPoint, 0))
  useLayoutEffect(() => {
    const el = popoverRef.current
    const parts = ['.thread-popover-header', '.thread-popover-body', '.reply-form']
    const measure = () => {
      const natural = parts.reduce((sum, selector) => {
        const part = el.querySelector(selector)
        return sum + (part ? (selector === '.thread-popover-body' ? part.scrollHeight : part.offsetHeight) : 0)
      }, el.offsetHeight - el.clientHeight)
      setLayout(computeLayout({ x: anchorX, y: anchorY }, natural))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [thread, anchorX, anchorY])

  return createPortal(
    <div
      ref={popoverRef}
      className="comment-popover thread-popover"
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{ ...layout, width: POPOVER_WIDTH }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <ThreadPopoverContent thread={thread} round={round} titleId={titleId} onClose={onClose} onReload={onReload} />
    </div>,
    document.body
  )
}
