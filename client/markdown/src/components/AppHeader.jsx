/* global __APP_VERSION__ */
import { Logo } from '../../../shared/components/Logo.jsx'
import { ORIGIN_LABELS } from '../utils/originLabels.js'

export function AppHeader({
  isPlainTextFile,
  tocCollapsed,
  onToggleToc,
  origin,
  filePath,
  totalAnnotationCount,
  onSubmitFeedback,
  onApprove,
  onOpenSettings,
  sidebarCollapsed,
  onToggleSidebar,
}) {
  return (
    <header className="app-header">
      <div className="header-left">
        {!isPlainTextFile && (
          <button
            onClick={onToggleToc}
            className="btn btn-icon"
            title={tocCollapsed ? 'Show table of contents' : 'Hide table of contents'}
            aria-label={tocCollapsed ? 'Show table of contents' : 'Hide table of contents'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>
        )}
        <Logo className="app-logo" />
        <span className="version-badge">v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'}</span>
        {ORIGIN_LABELS[origin] && (
          <span className="origin-badge">{ORIGIN_LABELS[origin]}</span>
        )}
        <span className="app-target" title={filePath}>{filePath}</span>
      </div>
      <div className="header-right">
        <button
          onClick={onSubmitFeedback}
          className={`btn btn-feedback${totalAnnotationCount > 0 ? ' btn-primary' : ''}`}
          disabled={totalAnnotationCount === 0}
          title={totalAnnotationCount === 0 ? 'Add annotations first' : `Submit ${totalAnnotationCount} annotation(s)`}
        >
          Feedback
          {totalAnnotationCount > 0 && <span className="btn-badge">{totalAnnotationCount}</span>}
        </button>
        <button
          onClick={onApprove}
          className={`btn btn-approve${totalAnnotationCount === 0 ? ' btn-primary' : ''}`}
          title={totalAnnotationCount > 0
            ? `Approve as-is and pass ${totalAnnotationCount} annotation(s) along as notes`
            : 'Approve file as-is'}
        >
          {totalAnnotationCount > 0 ? 'Approve with Notes' : 'Approve'}
        </button>
        <button
          onClick={onOpenSettings}
          className="btn btn-icon"
          title="Settings"
          aria-label="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <button
          onClick={onToggleSidebar}
          className="btn btn-icon"
          title={sidebarCollapsed ? 'Show annotations' : 'Hide annotations'}
          aria-label={sidebarCollapsed ? 'Show annotations' : 'Hide annotations'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
        </button>
      </div>
    </header>
  )
}
