import { ACTION_ICONS } from '../utils/icons.jsx'
import { hasMark } from './threadView.js'
import { orphanThreads, pendingReplyCount } from '../../../shared/threads/threadView.js'
import ThreadEntry from '../../../shared/threads/ThreadEntry.jsx'

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
