import { SettingsModal as SharedSettingsModal } from '../../../shared/components/SettingsModal.jsx'
import { SettingRow, SegmentedControl } from '../../../shared/components/SettingsControls.jsx'

const WIDTHS = [
  { value: 680, label: 'Narrow' },
  { value: 900, label: 'Default' },
  { value: 1200, label: 'Wide' },
  { value: 9999, label: 'Full' }
]

const FONT_SIZES = [
  { value: 13, label: 'S' },
  { value: 15, label: 'M' },
  { value: 17, label: 'L' },
  { value: 20, label: 'XL' }
]

const MODES = [
  { value: 'select', label: 'Select text' },
  { value: 'pinpoint', label: 'Pinpoint' }
]

function MarkdownSection({ settings, updateSetting }) {
  return (
    <div className="settings-section-body">
      <SettingRow id="setting-width" label="Content width" description="Maximum width of the rendered Markdown">
        <SegmentedControl id="setting-width" options={WIDTHS} value={settings.contentWidth} onChange={(v) => updateSetting('contentWidth', v)} />
      </SettingRow>
      <SettingRow id="setting-font" label="Font size" description="Base font size of the preview">
        <SegmentedControl id="setting-font" options={FONT_SIZES} value={settings.fontSize} onChange={(v) => updateSetting('fontSize', v)} />
      </SettingRow>
      <SettingRow id="setting-mode" label="Starting mode" description="What a new review opens in">
        <SegmentedControl id="setting-mode" options={MODES} value={settings.defaultMode} onChange={(v) => updateSetting('defaultMode', v)} />
      </SettingRow>
    </div>
  )
}

const SECTIONS = [{ id: 'markdown', label: 'Markdown', hint: 'width, size, mode', render: (props) => <MarkdownSection {...props} /> }]

export function SettingsModal(props) {
  return <SharedSettingsModal {...props} kind="markdown" drafts extraSections={SECTIONS} />
}
