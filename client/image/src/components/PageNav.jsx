const CHEVRON_PATHS = { previous: 'M15 18l-6-6 6-6', next: 'M9 18l6-6-6-6' }

function Chevron({ direction }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CHEVRON_PATHS[direction]} />
    </svg>
  )
}

/** Previous and next page of a PDF, with where the reviewer is in between. */
export default function PageNav({ pages, current, onStep }) {
  const index = pages.findIndex((p) => p.number === current)
  return (
    <div className="zoom-controls page-nav" role="toolbar" aria-label="Page navigation">
      <button type="button" onClick={() => onStep(-1)} disabled={index <= 0} title="Previous page (PageUp)" aria-label="Previous page">
        <Chevron direction="previous" />
      </button>
      <span className="page-nav-position" aria-live="polite">
        Page {current} <span className="page-nav-total">/ {pages.at(-1)?.number}</span>
      </span>
      <button type="button" onClick={() => onStep(1)} disabled={index >= pages.length - 1} title="Next page (PageDown)" aria-label="Next page">
        <Chevron direction="next" />
      </button>
    </div>
  )
}
