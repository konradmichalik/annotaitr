/* global __APP_VERSION__ */
import { useState, useRef, useEffect } from 'react'
import { Logo } from './Logo.jsx'
import { CloseIcon } from './CloseIcon.jsx'
import { useModalDismiss } from '../hooks/useModalDismiss.js'

export function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="settings-segmented" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          className={`settings-segmented-btn${value === opt.value ? ' active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon && <span className="settings-segmented-icon">{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function SettingRow({ label, description, children }) {
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <span className="settings-row-label">{label}</span>
        {description && <span className="settings-row-desc">{description}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`settings-toggle${checked ? ' active' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-thumb" />
    </button>
  )
}

const ICON_PROPS = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

const THEME_OPTIONS = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    )
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: <svg {...ICON_PROPS}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
  },
  {
    value: 'auto',
    label: 'Auto',
    icon: <svg {...ICON_PROPS}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" /></svg>
  }
]

export function ThemeRow({ settings, updateSetting }) {
  return (
    <SettingRow label="Theme" description="Choose light, dark, or follow system preference">
      <SegmentedControl options={THEME_OPTIONS} value={settings.theme} onChange={(v) => updateSetting('theme', v)} />
    </SettingRow>
  )
}

export function AutoCloseRow({ settings, updateSetting }) {
  return (
    <SettingRow label="Auto-close after submit" description="Automatically close the tab after feedback is submitted">
      <SegmentedControl
        options={[
          { value: 'off', label: 'Off' },
          { value: '0', label: 'Instant' },
          { value: '3', label: '3s' },
          { value: '5', label: '5s' }
        ]}
        value={settings.autoCloseDelay}
        onChange={(v) => updateSetting('autoCloseDelay', v)}
      />
    </SettingRow>
  )
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
export const MOD = isMac ? '⌘' : 'Ctrl'

function ShortcutsTab({ groups }) {
  return (
    <div className="settings-tab-content">
      {groups.map((group) => (
        <div key={group.title} className="shortcuts-group">
          <h3 className="shortcuts-group-title">{group.title}</h3>
          <div className="shortcuts-list">
            {group.items.map((item) => (
              <div key={item.keys} className="shortcut-row">
                <kbd className="shortcut-keys">{item.keys}</kbd>
                <span className="shortcut-desc">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AboutTab() {
  return (
    <div className="settings-tab-content about-tab">
      <Logo className="app-logo about-logo" />
      <span className="about-version">v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'}</span>
      <p className="about-description">
        Browser-based image and Markdown annotator for AI-assisted review, with built-in web page capture.
      </p>
      <a className="about-link" href="https://github.com/konradmichalik/annotaitr" target="_blank" rel="noreferrer">
        GitHub repository
      </a>
    </div>
  )
}

const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'about', label: 'About' }
]

/**
 * The settings dialog both modes share. Each mode passes the rows of its
 * Appearance and Behavior tabs and its shortcut list. `initialTab` is the tab
 * it opens on, so the header's shortcuts button lands on Shortcuts.
 */
export function SettingsModal({ isOpen, onClose, settings, updateSetting, resetSettings, appearance: Appearance, behavior: Behavior, shortcuts, initialTab = 'appearance' }) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const dialogRef = useRef(null)

  useEffect(() => {
    if (isOpen) { setActiveTab(initialTab) }
  }, [isOpen, initialTab])

  useModalDismiss(isOpen, onClose, dialogRef)

  if (!isOpen) { return null }

  const tabProps = { settings, updateSetting }
  const content = {
    appearance: <Appearance {...tabProps} />,
    behavior: <Behavior {...tabProps} />,
    shortcuts: <ShortcutsTab groups={shortcuts} />,
    about: <AboutTab />
  }[activeTab]

  return (
    <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) { onClose() } }}>
      <div ref={dialogRef} tabIndex={-1} className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
        <div className="modal-header">
          <h2 id="settings-modal-title">Settings</h2>
          <button type="button" className="modal-close" onClick={onClose} title="Close" aria-label="Close settings">
            <CloseIcon />
          </button>
        </div>

        <div className="settings-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`settings-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="modal-body settings-body" role="tabpanel">{content}</div>

        <div className="modal-footer settings-footer">
          {(activeTab === 'appearance' || activeTab === 'behavior') && (
            <button type="button" className="btn settings-reset-btn" onClick={resetSettings}>Reset to defaults</button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
