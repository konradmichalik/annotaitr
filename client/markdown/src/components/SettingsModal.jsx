import {
  SettingsModal as SharedSettingsModal, SettingRow, SegmentedControl, Toggle, ThemeRow, AutoCloseRow, MOD
} from '../../../shared/components/SettingsModal.jsx'

function AppearanceTab({ settings, updateSetting }) {
  return (
    <div className="settings-tab-content">
      <ThemeRow settings={settings} updateSetting={updateSetting} />

      <SettingRow label="Content width" description="Maximum width of the rendered markdown">
        <SegmentedControl
          options={[
            { value: 680, label: 'Narrow' },
            { value: 900, label: 'Default' },
            { value: 1200, label: 'Wide' },
            { value: 9999, label: 'Full' },
          ]}
          value={settings.contentWidth}
          onChange={v => updateSetting('contentWidth', v)}
        />
      </SettingRow>

      <SettingRow label="Font size" description="Base font size for the preview">
        <SegmentedControl
          options={[
            { value: 13, label: 'S' },
            { value: 15, label: 'M' },
            { value: 17, label: 'L' },
            { value: 20, label: 'XL' },
          ]}
          value={settings.fontSize}
          onChange={v => updateSetting('fontSize', v)}
        />
      </SettingRow>
    </div>
  )
}

function BehaviorTab({ settings, updateSetting }) {
  return (
    <div className="settings-tab-content">
      <SettingRow label="Default annotation mode" description="Start in selection or pinpoint mode">
        <SegmentedControl
          options={[
            { value: 'select', label: 'Select' },
            { value: 'pinpoint', label: 'Pinpoint' },
          ]}
          value={settings.defaultMode}
          onChange={v => updateSetting('defaultMode', v)}
        />
      </SettingRow>

      <AutoCloseRow settings={settings} updateSetting={updateSetting} />

      <SettingRow label="Auto-save drafts" description="Save annotation progress to restore on reload">
        <Toggle
          checked={settings.autoSaveDrafts}
          onChange={v => updateSetting('autoSaveDrafts', v)}
          label="Auto-save drafts"
        />
      </SettingRow>
    </div>
  )
}

const SHORTCUT_GROUPS = [
  {
    title: 'Annotations',
    items: [
      { keys: `${MOD} + Z`, desc: 'Undo' },
      { keys: `${MOD} + Shift + Z`, desc: 'Redo' },
      { keys: `1 / ${MOD} + K`, desc: 'Change: comment on selected text' },
      { keys: '2', desc: 'Add: insert text after the selection' },
      { keys: `3 / ${MOD} + D`, desc: 'Remove selected text' },
      { keys: '4', desc: 'Ask a question about selected text' },
      { keys: 'Tab, then 1\u20134', desc: 'Intent of the comment being written' },
      { keys: 'Alt + 1\u20130', desc: 'Quick label on selected text' },
      { keys: `${MOD} + Enter`, desc: 'Save the comment' },
      { keys: 'Escape', desc: 'Discard the comment being written' },
      { keys: 'Alt + Click', desc: 'Insert text at position' },
    ],
  },
  {
    title: 'Modes',
    items: [
      { keys: 'V', desc: 'Select text' },
      { keys: 'C', desc: 'Pinpoint' },
      { keys: 'Hold Shift', desc: 'Temporarily toggle Select text / Pinpoint' },
      { keys: 'G', desc: 'General comment' },
    ],
  },
  {
    title: 'Search',
    items: [
      { keys: `${MOD} + F`, desc: 'Open document search' },
      { keys: 'Enter / F3', desc: 'Next match' },
      { keys: 'Shift + Enter / Shift + F3', desc: 'Previous match' },
      { keys: 'Escape', desc: 'Clear query or close search' },
    ],
  },
  {
    title: 'Review',
    items: [
      { keys: `${MOD} + Shift + Enter`, desc: 'Open the decision' },
      { keys: `${MOD} + Enter`, desc: 'Submit the open decision' },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { keys: 'Escape', desc: 'Close toolbar, popover, or modal' },
      { keys: 'Type any key', desc: 'Quick-start comment from toolbar' },
    ],
  },
]

export function SettingsModal(props) {
  return <SharedSettingsModal {...props} appearance={AppearanceTab} behavior={BehaviorTab} shortcuts={SHORTCUT_GROUPS} />
}
