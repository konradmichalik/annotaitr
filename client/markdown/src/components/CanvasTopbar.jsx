export function CanvasTopbar({ shiftHeld, pinpointMode, onPinpointModeChange, showViewToggle, viewMode, onViewModeChange }) {
  return (
    <div className="canvas-topbar">
      <div
        className={`toolbar${shiftHeld ? ' toolbar--temp' : ''}`}
        role="toolbar"
        aria-label="Annotation mode"
      >
        <button
          type="button"
          className={!pinpointMode ? 'active' : ''}
          aria-pressed={!pinpointMode}
          onClick={() => onPinpointModeChange(shiftHeld)}
          title="Selection mode: select text to annotate (hold Shift to toggle)"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M3 10h8M3 15h10" />
          </svg>
          Select
        </button>
        <button
          type="button"
          className={pinpointMode ? 'active' : ''}
          aria-pressed={pinpointMode}
          onClick={() => onPinpointModeChange(!shiftHeld)}
          title="Pinpoint mode: click a block to annotate (hold Shift to toggle)"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
          </svg>
          Pinpoint
        </button>
      </div>
      {showViewToggle && (
        <div className="toolbar" role="toolbar" aria-label="View">
          <button
            type="button"
            className={viewMode === 'preview' ? 'active' : ''}
            aria-pressed={viewMode === 'preview'}
            onClick={() => onViewModeChange('preview')}
            title="Rendered preview"
            aria-label="Rendered preview"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            type="button"
            className={viewMode === 'source' ? 'active' : ''}
            aria-pressed={viewMode === 'source'}
            onClick={() => onViewModeChange('source')}
            title="Markdown source"
            aria-label="Markdown source"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <polyline strokeLinecap="round" strokeLinejoin="round" points="16 18 22 12 16 6" />
              <polyline strokeLinecap="round" strokeLinejoin="round" points="8 6 2 12 8 18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
