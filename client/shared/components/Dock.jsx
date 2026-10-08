import { useRovingFocus } from '../hooks/useRovingFocus.js'
import { KeyCap } from './KeyCap.jsx'

/** The floating tool bar at the bottom of the work area: one tab stop, arrow keys between its items. */
export function Dock({ label, className = '', children }) {
  const { ref, onFocus, onKeyDown } = useRovingFocus()
  return (
    <div ref={ref} className={`dock ${className}`.trim()} role="toolbar" aria-label={label} onFocus={onFocus} onKeyDown={onKeyDown}>
      {children}
    </div>
  )
}

/** A hairline between groups of dock items. */
export function DockSeparator() {
  return <span className="dock-separator" aria-hidden="true" />
}

/**
 * One dock item. Icon-only items name themselves "Name (Key)" and show the
 * name and key cap in a tooltip on hover and focus; items with `text` show
 * the name and key cap inline instead.
 */
export function DockButton({ label, keyCap = null, icon, text = false, pressed, onClick, disabled = false, className = '' }) {
  const name = keyCap ? `${label} (${keyCap})` : label
  return (
    <button
      type="button"
      data-dock-item=""
      className={`dock-button${text ? ' dock-button--text' : ''}${pressed ? ' active' : ''} ${className}`.trim()}
      aria-label={name}
      aria-pressed={pressed}
      aria-keyshortcuts={keyCap ?? undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {text ? (
        <>
          <span className="dock-button-label">{label}</span>
          {keyCap && <KeyCap>{keyCap}</KeyCap>}
        </>
      ) : (
        <span className="dock-tooltip" aria-hidden="true">
          {label}
          {keyCap && <KeyCap>{keyCap}</KeyCap>}
        </span>
      )}
    </button>
  )
}
