import StatusChip from '../components/StatusChip.jsx'
import { STATUS_DISPLAY, AUTHOR_LABELS, threadStatus, threadNumber, threadLabel, threadTitle } from './threadView.js'

const excerpt = (text) => (text && text.length > 120 ? `${text.slice(0, 120)}…` : text)

/**
 * One earlier-round note as a card, like this round's NoteCard: the number in
 * a dashed grey badge, the agent's status as icon and word, then the
 * reviewer's note, the agent's last reply and a reply of the reviewer's own
 * (pending until the decision sends it). The card opens the thread; so does
 * Reply, which is where an answer is written, unless `onReply` does that
 * apart. `place` is an optional line naming where the note is now,
 * `controls` the id of the thread it opens in place.
 */
export default function ThreadEntry({ thread, round, onActivate, onReply = onActivate, place = null, expanded, controls }) {
  const lastAgent = thread.replies.findLast((r) => (r.author ?? 'agent') === 'agent')
  const last = thread.replies.at(-1)
  const ownReply = last && last.author === 'human' ? last : null
  const number = threadNumber(thread)
  return (
    <li className="note-card reply-card">
      <button type="button" className="previous-round-entry" aria-expanded={expanded} aria-controls={expanded ? controls : undefined} onClick={(event) => onActivate(thread, event.currentTarget)}>
        <span className="note-card-head">
          {number !== null && (
            <span className="note-number note-number--earlier"><span className="visually-hidden">{threadTitle(thread, round)}.</span><span aria-hidden="true">{threadLabel(thread, round)}</span></span>
          )}
          {number === null && <span className="visually-hidden">{threadTitle(thread, round)}.</span>}
          <StatusChip status={threadStatus(thread)} display={STATUS_DISPLAY} />
          {place && <span className="previous-round-entry-place">{place}</span>}
        </span>
        <span className="previous-round-entry-text">{AUTHOR_LABELS.human}: {excerpt(thread.annotation.text)}</span>
        {lastAgent && (
          <span className="previous-round-entry-reply">{AUTHOR_LABELS.agent}: {excerpt(lastAgent.text)}</span>
        )}
        {ownReply && (
          <span className={`previous-round-entry-reply${ownReply.pending ? ' previous-round-entry-reply--pending' : ''}`}>
            {AUTHOR_LABELS.human}: {excerpt(ownReply.text)}{ownReply.pending && <span className="reply-card-pending"> · pending</span>}
          </span>
        )}
        {thread.anchor === 'orphan' && thread.reason && <span className="previous-round-entry-reason">{thread.reason}</span>}
      </button>
      <button type="button" className="reply-card-reply" onClick={(event) => onReply(thread, event.currentTarget)}>
        Reply
      </button>
    </li>
  )
}
