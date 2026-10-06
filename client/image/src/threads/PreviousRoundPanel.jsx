import StatusChip from '../../../shared/components/StatusChip.jsx'
import { STATUS_DISPLAY, threadStatus, orphanThreads, hasMark } from './threadView.js'

function ThreadEntry({ thread, onActivate }) {
  return (
    <li>
      <button type="button" className="previous-round-entry" onClick={(event) => onActivate(thread, event.currentTarget)}>
        <span className="previous-round-entry-number">{thread.number}.</span>
        <StatusChip status={threadStatus(thread)} display={STATUS_DISPLAY} />
        <span className="previous-round-entry-text">{thread.annotation.text}</span>
        {thread.anchor === 'orphan' && thread.reason && <span className="previous-round-entry-reason">{thread.reason}</span>}
      </button>
    </li>
  )
}

export default function PreviousRoundPanel({ round, threads, onShow, onShowDetached }) {
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
      <details open>
        <summary id="previous-round-summary">Round {round} replies ({threads.length})</summary>
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
