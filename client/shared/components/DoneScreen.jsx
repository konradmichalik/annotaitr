import { Logo } from './Logo.jsx'

const ICONS = {
  approved: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  feedback: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  disconnected: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
      <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0122.56 9" />
      <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
      <path d="M8.53 16.11a6 6 0 016.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  )
}

/** The full-page card shown once the review is over, or once the server went away. */
export function DoneScreen({ variant, title, message, children }) {
  return (
    <div className="done-screen canvas-surface">
      <div className="done-card">
        <div className={`done-icon done-icon--${variant}`}>{ICONS[variant]}</div>
        <h1 className="done-title">{title}</h1>
        <p className="done-message">{message}</p>
        {children}
      </div>
      <Logo className="app-logo done-logo" />
    </div>
  )
}

/** Countdown, failure note or opt-in checkbox, depending on the useAutoClose phase. */
export function DoneAutoClose({ state, onEnable }) {
  return (
    <div className="done-autoclose">
      {state.phase === 'counting' && (
        <p className="done-countdown">
          This tab will close in <span className="done-countdown-number">{state.remaining}</span> second{state.remaining !== 1 ? 's' : ''}...
        </p>
      )}
      {state.phase === 'closeFailed' && (
        <p className="done-hint">Could not close this tab automatically. Please close it manually.</p>
      )}
      {state.phase === 'prompt' && (
        <label className="done-autoclose-prompt">
          <input type="checkbox" checked={false} onChange={onEnable} />
          <span>Auto-close this tab after 3 seconds</span>
        </label>
      )}
    </div>
  )
}
