const Arrow = ({ up }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
  </svg>
)

/**
 * Previous and next note around the place of the selected one (`position`,
 * one-based, 0 when none is selected). It stops at the first and the last
 * note, so the buttons are marked disabled there. They stay focusable, or the
 * focus would drop to the page when the reviewer steps onto the last note.
 */
export function NoteStepper({ count, position, onStep }) {
  if (count < 2) { return null }
  const step = (delta, atEnd) => { if (!atEnd) { onStep(delta) } }
  return (
    <div className="note-stepper" role="group" aria-label="Go through notes">
      <button type="button" className="panel-icon-btn" aria-label="Previous note" title="Previous note (Shift+N)" aria-disabled={position === 1 || undefined} onClick={() => step(-1, position === 1)}>
        <Arrow up />
      </button>
      <span className="note-stepper-count" aria-live="polite">{position > 0 ? `${position} of ${count}` : `${count} notes`}</span>
      <button type="button" className="panel-icon-btn" aria-label="Next note" title="Next note (N)" aria-disabled={position === count || undefined} onClick={() => step(1, position === count)}>
        <Arrow />
      </button>
    </div>
  )
}
