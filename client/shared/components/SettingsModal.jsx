/* global __APP_VERSION__ */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Logo } from './Logo.jsx'
import { CloseIcon } from './CloseIcon.jsx'
import { SettingRow, SegmentedControl, Toggle, ThemeTiles } from './SettingsControls.jsx'
import { ShortcutList } from './ShortcutList.jsx'
import { useModalDismiss } from '../hooks/useModalDismiss.js'
import { trapTab } from '../utils/focusTrap.js'
import { INTENTS } from '../utils/intents.js'
import { KIND_LABELS } from '../utils/shortcuts.js'

const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'

// The stored delay values stay as they were, so existing cookies keep working.
const CLOSE_OPTIONS = [
  { value: 'off', label: 'Never' },
  { value: '0', label: 'Now' },
  { value: '3', label: '3 s' },
  { value: '5', label: '5 s' }
]

function GeneralSection({ settings, updateSetting, drafts, tips }) {
  return (
    <div className="settings-section-body">
      <ThemeTiles value={settings.theme} onChange={(v) => updateSetting('theme', v)} />
      <SettingRow id="setting-close" label="Close tab after a decision" description="The done page shows what was sent first">
        <SegmentedControl id="setting-close" options={CLOSE_OPTIONS} value={settings.autoCloseDelay} onChange={(v) => updateSetting('autoCloseDelay', v)} />
      </SettingRow>
      {drafts && (
        <SettingRow id="setting-drafts" label="Keep drafts" description="Unsent notes survive a reload or a closed tab">
          <Toggle id="setting-drafts" checked={settings.keepDrafts} onChange={(v) => updateSetting('keepDrafts', v)} />
        </SettingRow>
      )}
      <SettingRow id="setting-hints" label="Tool hints" description={tips ? 'First-run tips and the help line in the status bar' : 'The help line in the status bar'}>
        <Toggle id="setting-hints" checked={settings.toolHints} onChange={(v) => updateSetting('toolHints', v)} />
      </SettingRow>
      <SettingRow id="setting-intent" label="Default intent" description="For new pins, shapes and selections" labelFor="setting-intent-select">
        <select
          id="setting-intent-select"
          className="settings-select"
          aria-describedby="setting-intent-desc"
          value={settings.defaultIntent}
          onChange={(event) => updateSetting('defaultIntent', event.target.value)}
        >
          {INTENTS.map((intent) => <option key={intent.id} value={intent.id}>{intent.word}</option>)}
        </select>
      </SettingRow>
    </div>
  )
}

function AboutSection() {
  return (
    <div className="settings-section-body settings-about">
      <Logo className="app-logo settings-about-logo" />
      <span className="settings-about-version">Version {VERSION}</span>
      <p className="settings-about-text">
        Browser-based image and Markdown annotator for AI-assisted review, with built-in web page capture.
      </p>
      <a className="settings-about-link" href="https://github.com/konradmichalik/annotaitr" target="_blank" rel="noreferrer">
        GitHub repository
      </a>
    </div>
  )
}

const STEPS = { ArrowUp: -1, ArrowDown: 1 }

/**
 * The settings dialog both modes share: sections in a left column (General,
 * the mode's own `extraSections`, Shortcuts, About), changes applied right
 * away. `kind` picks the shortcuts of the open mode, `drafts` whether the
 * mode keeps drafts. `initialSection` is where it opens, so `?` and the
 * header's shortcuts button land on Shortcuts.
 */
export function SettingsModal({ isOpen, ...props }) {
  return isOpen ? <SettingsDialog {...props} /> : null
}

function SettingsDialog({
  onClose, settings, updateSetting, resetSettings, kind, drafts = false, extraSections = [], initialSection = 'general'
}) {
  const sections = [
    { id: 'general', label: 'General' },
    ...extraSections,
    { id: 'shortcuts', label: 'Shortcuts' },
    { id: 'about', label: 'About' }
  ]
  const [active, setActive] = useState(initialSection)
  const dialogRef = useRef(null)
  const searchRef = useRef(null)

  // A ref keeps the dismiss effect from re-running, and moving focus, on every render of the owner.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const close = useCallback(() => closeRef.current(), [])
  useModalDismiss(true, close, dialogRef)

  // Opened with `?` the search takes the keys, otherwise the selected section does.
  const openedOn = useRef(initialSection)
  useEffect(() => {
    const target = openedOn.current === 'shortcuts' ? searchRef.current : dialogRef.current?.querySelector('[role="tab"][aria-selected="true"]')
    target?.focus()
  }, [])

  const handleTabKey = (event) => {
    const index = sections.findIndex((section) => section.id === active)
    let next = null
    if (event.key in STEPS) { next = sections[(index + STEPS[event.key] + sections.length) % sections.length] }
    if (event.key === 'Home') { next = sections[0] }
    if (event.key === 'End') { next = sections.at(-1) }
    if (!next) { return }
    event.preventDefault()
    setActive(next.id)
    dialogRef.current.querySelector(`#settings-tab-${next.id}`)?.focus()
  }

  const current = sections.find((section) => section.id === active) ?? sections[0]
  const props = { settings, updateSetting }
  let body = <GeneralSection {...props} drafts={drafts} tips={kind === 'markdown'} />
  if (current.render) { body = current.render(props) }
  if (current.id === 'shortcuts') { body = <ShortcutList kind={kind} searchRef={searchRef} /> }
  if (current.id === 'about') { body = <AboutSection /> }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { close() } }}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onKeyDown={(event) => trapTab(event, dialogRef.current)}
      >
        <nav className="settings-nav" aria-labelledby="settings-title">
          <h2 id="settings-title" className="settings-title">Settings</h2>
          <div className="settings-tabs" role="tablist" aria-orientation="vertical" aria-labelledby="settings-title" onKeyDown={handleTabKey}>
            {sections.map((section) => (
              <button
                key={section.id}
                id={`settings-tab-${section.id}`}
                type="button"
                role="tab"
                aria-selected={section.id === current.id}
                aria-controls="settings-panel"
                tabIndex={section.id === current.id ? 0 : -1}
                className="settings-tab"
                onClick={() => setActive(section.id)}
              >
                {section.label}
                {section.hint && <span className="settings-tab-hint">{section.hint}</span>}
              </button>
            ))}
          </div>
          {current.id === 'shortcuts'
            ? <span className="settings-nav-note">Opens directly with <kbd>?</kbd></span>
            : <span className="settings-nav-note settings-version">annotaitr {VERSION}</span>}
        </nav>

        <div className="settings-main">
          <div className="settings-main-header">
            <h3 className="settings-section-title">
              {current.label}
              {current.id === 'shortcuts' && KIND_LABELS[kind] && <span className="settings-section-for"> for {KIND_LABELS[kind]}</span>}
            </h3>
            <button type="button" className="modal-close" onClick={close} title="Close" aria-label="Close settings">
              <CloseIcon />
            </button>
          </div>
          <div id="settings-panel" className="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${current.id}`}>
            {body}
          </div>
          <div className="settings-footer">
            <span className="settings-footer-note">Changes apply right away</span>
            <button type="button" className="settings-reset" onClick={resetSettings}>Reset to defaults</button>
          </div>
        </div>
      </div>
    </div>
  )
}
