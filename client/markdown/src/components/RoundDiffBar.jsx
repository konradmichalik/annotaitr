const COUNTS = [
  ['added', '+', 'diff-count-add'],
  ['changed', '±', 'round-diff-count-changed'],
  ['removed', '−', 'diff-count-del']
]

/**
 * The switch to the changes view of a file the agent revised since the last
 * round, above the content as a view option, with what changed. The view is
 * read only, so the bar says where notes go while it shows.
 */
export function RoundDiffBar({ diff, active, onToggle }) {
  const parts = COUNTS.filter(([key]) => diff.counts[key] > 0)
  return (
    <div className="round-diff-bar">
      <button type="button" className="btn btn-secondary round-diff-toggle" aria-pressed={active} onClick={() => onToggle(!active)}>
        Changes since round {diff.round}
      </button>
      <span className="round-diff-counts">
        {parts.map(([key, sign, className], index) => (
          <span key={key}>
            {index > 0 && ' · '}
            <span className={className}>{sign}{diff.counts[key]}</span> {key}
          </span>
        ))}
      </span>
      {active && <span className="round-diff-hint">Read only. Turn it off to add notes.</span>}
    </div>
  )
}
