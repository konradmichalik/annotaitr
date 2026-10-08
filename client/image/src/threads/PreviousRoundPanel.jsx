import StatusChip from '../../../shared/components/StatusChip.jsx'
import { ACTION_ICONS } from '../utils/icons.jsx'
import { STATUS_DISPLAY, AUTHOR_LABELS, threadStatus, threadNumber, threadLabel, threadTitle, orphanThreads, hasMark, pendingReplyCount } from './threadView.js'

const excerpt = (text) => (text && text.length > 120 ? `${text.slice(0, 120)}…` : text)

/**
 * One earlier-round note as a card, like this round's NoteCard: the number in
 * a dashed grey badge, the agent's status as icon and word, then the
 * reviewer's note, the agent's last reply and a reply of the reviewer's own
 * (pending until the decision sends it). The card opens the thread; so does
 * Reply, which is where an answer is written.
 */
function ThreadEntry({ thread, round, onActivate }) {
  const lastAgent = thread.replies.findLast((r) => (r.author ?? 'agent') === 'agent')
  const last = thread.replies.at(-1)
  const ownReply = last && last.author === 'human' ? last : null
  const number = threadNumber(thread)
  return (
    <li className="note-card reply-card">
      <button type="button" className="previous-round-entry" onClick={(event) => onActivate(thread, event.currentTarget)}>
        <span className="note-card-head">
          {number !== null && (
            <span className="note-number note-number--earlier"><span className="visually-hidden">{threadTitle(thread, round)}.</span><span aria-hidden="true">{threadLabel(thread, round)}</span></span>
          )}
          <StatusChip status={threadStatus(thread)} display={STATUS_DISPLAY} />
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
      <button type="button" className="reply-card-reply" onClick={(event) => onActivate(thread, event.currentTarget)}>
        Reply
      </button>
    </li>
  )
}

export default function PreviousRoundPanel({ round, threads, showOnImage, onToggleShowOnImage, onShow }) {
  if (threads.length === 0) { return null }

  const toSend = pendingReplyCount(threads)
  const orphans = orphanThreads(threads)
  const placed = threads.filter((t) => t.anchor !== 'orphan')

  return (
    <section className="previous-round-panel" aria-labelledby="previous-round-summary">
      {/* A sibling of the details, not part of the summary, so a press on the switch can never fold the section. */}
      {threads.some(hasMark) && (
      <button
        type="button"
        role="switch"
        aria-checked={showOnImage}
        aria-label="Show on image"
        className="previous-round-switch"
        onClick={onToggleShowOnImage}
      >
        <span className="previous-round-switch-label">On image</span>
        <span className="previous-round-switch-track" aria-hidden="true"><span className="previous-round-switch-knob" /></span>
      </button>
      )}
      <details open>
        <summary id="previous-round-summary">
          <span className="previous-round-icon">{ACTION_ICONS.history}</span>
          <span className="previous-round-title">Round {round} replies</span> <span className="panel-badge">{threads.length}</span>
          {toSend > 0 && <span className="previous-round-to-send">· {toSend} to send</span>}
        </summary>
        {placed.length > 0 && (
          <ul className="previous-round-list">
            {placed.map((t) => <ThreadEntry key={t.handle} thread={t} round={round} onActivate={onShow} />)}
          </ul>
        )}
        {orphans.length > 0 && (
          <>
            <h3 className="previous-round-heading">No longer in the target</h3>
            <ul className="previous-round-list">
              {orphans.map((t) => <ThreadEntry key={t.handle} thread={t} round={round} onActivate={onShow} />)}
            </ul>
          </>
        )}
      </details>
    </section>
  )
}
