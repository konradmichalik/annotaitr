import { Logo } from './Logo.jsx'
import { DecisionButton } from './DecisionButton.jsx'
import { KeyboardIcon, SettingsIcon, SidePanelIcon, SourceIcon } from './HeaderIcons.jsx'
import { originTooltip, waitingLabel } from '../utils/origin.js'

const SOURCE_LABELS = {
  pdf: 'PDF',
  image: 'Image',
  clipboard: 'Clipboard',
  url: 'URL',
  video: 'Video',
  markdown: 'Markdown',
  text: 'Text'
}

function OriginIndicator({ origin }) {
  const tooltip = originTooltip(origin)
  return (
    <span className="origin-indicator" title={tooltip}>
      <span className="origin-indicator-dot" aria-hidden="true" />
      {waitingLabel(origin)}
      <span className="visually-hidden">. {tooltip}</span>
    </span>
  )
}

function IconButton({ label, onClick, children }) {
  return (
    <button type="button" className="btn btn-icon header-icon-btn" onClick={onClick} title={label} aria-label={label}>
      {children}
    </button>
  )
}

/**
 * The header both clients share, left to right: logo, source chip, target and
 * its facts, round chip, then shortcuts, settings and panel toggle, the origin
 * indicator and the decision split button. `leading` holds a mode's own
 * control in front of the logo (the markdown table of contents toggle).
 */
export function AppHeader({
  leading = null, source, target, facts, round = null, origin,
  onOpenShortcuts, onOpenSettings, panelCollapsed, onTogglePanel, decision
}) {
  return (
    <header className="app-header">
      <div className="header-start">
        {leading}
        <Logo className="app-logo" />
        {source && (
          <span className="source-chip">
            <SourceIcon kind={source} />
            {SOURCE_LABELS[source]}
          </span>
        )}
        {target && <span className="app-target" title={target}>{target}</span>}
        {facts && <span className="header-facts">{facts}</span>}
        {round !== null && (
          <span className="round-chip" title={`Round ${round} of this review. Earlier rounds are in the panel.`}>
            <span className="round-chip-dot" aria-hidden="true" />
            Round {round}
          </span>
        )}
      </div>
      <div className="header-end">
        {onOpenShortcuts && <IconButton label="Keyboard shortcuts" onClick={onOpenShortcuts}><KeyboardIcon /></IconButton>}
        <IconButton label="Settings" onClick={onOpenSettings}><SettingsIcon /></IconButton>
        <IconButton label={panelCollapsed ? 'Show feedback panel' : 'Hide feedback panel'} onClick={onTogglePanel}>
          <SidePanelIcon side="right" />
        </IconButton>
        {origin && <OriginIndicator origin={origin} />}
        <DecisionButton {...decision} />
      </div>
    </header>
  )
}
