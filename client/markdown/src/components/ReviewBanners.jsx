export function HashMismatchBanner({ onReload }) {
  return (
    <div className="hash-mismatch-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>File has changed since annotations were saved. Annotations may be outdated.</span>
      <button onClick={onReload} className="btn btn-sm">Reload</button>
    </div>
  )
}

export function DraftBanner({ draft, onRestore, onDismiss }) {
  return (
    <div className="draft-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      <span>Found {draft.count} unsaved annotation{draft.count !== 1 ? 's' : ''} from {draft.timeAgo}.</span>
      <button onClick={onRestore} className="btn btn-sm">Restore</button>
      <button onClick={onDismiss} className="btn btn-sm btn-muted">Dismiss</button>
    </div>
  )
}
