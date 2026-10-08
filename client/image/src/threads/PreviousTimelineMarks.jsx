import { statusDisplay, threadNumber, threadRound } from './threadView.js'

/** What an earlier-round mark is called: its round, number and the agent's status. */
export function previousMarkName(thread, round) {
  return `Round ${threadRound(thread, round)} mark ${threadNumber(thread)}, ${statusDisplay(thread).label}`
}

/**
 * One mark of the last round on the timeline: dashed grey, never filled, so
 * it never competes with this round's notes. Read-only: activating it seeks
 * there and opens its thread.
 */
export function PreviousMark({ thread, round, style, onShow }) {
  const name = previousMarkName(thread, round)
  return (
    <button
      type="button"
      className={`timeline-marker timeline-marker--previous timeline-marker--${thread.anchor}`}
      style={style}
      aria-label={name}
      title={`${name}: ${thread.annotation.text ?? ''}`}
      onClick={(event) => onShow(thread, event.currentTarget)}
    >
      {threadNumber(thread)}
    </button>
  )
}
