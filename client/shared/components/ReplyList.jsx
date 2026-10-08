import StatusChip from './StatusChip.jsx'

// labels maps an author key to its visible name, so each client supplies its own wording.
export default function ReplyList({ replies, display, labels = {}, pendingLabel, onRemove }) {
  return (
    <ol className="reply-list">
      {replies.map((reply, index) => {
        const author = reply.author ?? 'agent'
        const createdAt = new Date(reply.createdAt)
        // A bad timestamp in a session file must not blank the whole review, toISOString() throws on it.
        const hasDate = !Number.isNaN(createdAt.getTime())
        return (
          <li key={reply.id ?? index} className={`reply-list-item reply-list-item--${author}`}>
            {labels[author] && <span className="reply-list-author">{labels[author]}</span>}
            {author !== 'human' && <StatusChip status={reply.status} display={display} />}
            {reply.pending && pendingLabel && <span className="reply-list-pending">{pendingLabel}</span>}
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
          </li>
        )
      })}
    </ol>
  )
}
