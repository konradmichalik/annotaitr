import StatusChip from '../../../shared/components/StatusChip.jsx'
import { ACTION_ICONS } from '../utils/icons.jsx'
import { STATUS_DISPLAY, AUTHOR_LABELS, threadStatus, orphanThreads, hasMark } from './threadView.js'

function ThreadEntry({ thread, onActivate }) {
  const lastReply = thread.replies.at(-1)
  return (
    <li>
      <button type="button" className="previous-round-entry" onClick={(event) => onActivate(thread, event.currentTarget)}>
        <span className="previous-round-entry-number">{thread.number}.</span>
        <StatusChip status={threadStatus(thread)} display={STATUS_DISPLAY} />
        <span className="previous-round-entry-text">{thread.annotation.text}</span>
        {lastReply && (
          <span className="previous-round-entry-reply">{AUTHOR_LABELS.agent}: {lastReply.text}</span>
        )}
        {thread.anchor === 'orphan' && thread.reason && <span className="previous-round-entry-reason">{thread.reason}</span>}
      </button>
    </li>
  )
}

export default function PreviousRoundPanel({ round, threads, showOnImage, onToggleShowOnImage, onShow, onShowDetached }) {
  if (threads.length === 0) { return null }

  const orphans = orphanThreads(threads)
  const placed = threads.filter((t) => t.anchor !== 'orphan')

  const activate = (thread, button) => {
    if (hasMark(thread)) {
      onShow(thread, button)
      return
    }
    const rect = button.getBoundingClientRect()
    onShowDetached(thread, { x: rect.left + rect.width / 2, y: rect.bottom }, button)
  }

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
        title="Show or hide last round's marks and replies on the image"
      >
        <span className="previous-round-switch-label">On image</span>
        <span className="previous-round-switch-track" aria-hidden="true"><span className="previous-round-switch-knob" /></span>
      </button>
      )}
      <details open>
        <summary id="previous-round-summary">
          <span className="previous-round-icon">{ACTION_ICONS.history}</span>
          Round {round} replies <span className="panel-badge">{threads.length}</span>
        </summary>
        {placed.length > 0 && (
          <ul className="previous-round-list">
            {placed.map((t) => <ThreadEntry key={t.handle} thread={t} onActivate={activate} />)}
          </ul>
        )}
        {orphans.length > 0 && (
          <>
            <h3 className="previous-round-heading">No longer in the target</h3>
            <ul className="previous-round-list">
              {orphans.map((t) => <ThreadEntry key={t.handle} thread={t} onActivate={activate} />)}
            </ul>
          </>
        )}
      </details>
    </section>
  )
}
