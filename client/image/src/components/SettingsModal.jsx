import { SettingsModal as SharedSettingsModal } from '../../../shared/components/SettingsModal.jsx'

// The clipboard is an image like any other as far as the keys go.
const SHORTCUT_KINDS = { clipboard: 'image', image: 'image', url: 'url', pdf: 'pdf', video: 'video' }

/** The image modes keep no drafts: the server holds every note until the decision. */
export default function SettingsModal({ source, ...props }) {
  return <SharedSettingsModal {...props} kind={SHORTCUT_KINDS[source] ?? 'image'} />
}
