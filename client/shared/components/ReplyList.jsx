import StatusChip from './StatusChip.jsx'
import { ClockIcon } from './HeaderIcons.jsx'

/**
 * A thread as a list of messages. `labels` maps an author key to its visible
 * name and `avatars` to the short mark in its avatar, so each client supplies
 * its own wording. A message may carry `meta` (such as "round 1") after the name.
 */
export default function ReplyList({ replies, display, labels = {}, avatars = {}, pendingLabel, onRemove }) {
  return (
    <ol className="reply-list">
      {replies.map((reply, index) => {
        const author = reply.author ?? 'agent'
        const createdAt = new Date(reply.createdAt)
        // A bad timestamp in a session file must not blank the whole review, toISOString() throws on it.
        const hasDate = !Number.isNaN(createdAt.getTime())
        return (
          <li key={reply.id ?? index} className={`reply-list-item reply-list-item--${author}${reply.pending ? ' reply-list-item--pending' : ''}`}>
            {avatars[author] && <span className="reply-list-avatar" aria-hidden="true">{avatars[author]}</span>}
            <div className="reply-list-body">
              <div className="reply-list-meta">
                {labels[author] && <span className="reply-list-author">{labels[author]}</span>}
                {reply.meta && <span className="reply-list-detail">· {reply.meta}</span>}
                {author !== 'human' && <StatusChip status={reply.status} display={display} />}
              </div>
              {reply.pending && pendingLabel && <span className="reply-list-pending"><ClockIcon size={12} />{pendingLabel}</span>}
              <p className="reply-list-text">{reply.text}</p>
              {hasDate && (
                <time className="reply-list-time" dateTime={createdAt.toISOString()}>
                  {createdAt.toLocaleString()}
                </time>
              )}
              {reply.pending && onRemove && (
                <button type="button" className="reply-list-remove" aria-label="Remove your reply" onClick={() => onRemove(reply)}>
                  Remove
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
