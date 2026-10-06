import { SettingsModal as SharedSettingsModal, ThemeRow, AutoCloseRow, MOD } from '../../../shared/components/SettingsModal.jsx'

function AppearanceTab(props) {
  return (
    <div className="settings-tab-content">
      <ThemeRow {...props} />
    </div>
  )
}

function BehaviorTab(props) {
  return (
    <div className="settings-tab-content">
      <AutoCloseRow {...props} />
    </div>
  )
}

const SHORTCUT_GROUPS = [
  {
    title: 'Annotations',
    items: [
      { keys: 'Click a mark', desc: 'Select it (shows resize handles)' },
      { keys: 'Click again', desc: 'Edit its comment and color' },
      { keys: 'Drag a mark', desc: 'Move it' },
      { keys: 'Drag a corner handle', desc: 'Resize it' },
      { keys: 'Delete / Backspace', desc: 'Remove the selected mark' },
      { keys: 'Escape', desc: 'Close the comment popover' }
    ]
  },
  {
    title: 'View',
    items: [
      { keys: `${MOD} + Scroll`, desc: 'Zoom in / out' }
    ]
  }
]

export default function SettingsModal(props) {
  return <SharedSettingsModal {...props} appearance={AppearanceTab} behavior={BehaviorTab} shortcuts={SHORTCUT_GROUPS} />
}
