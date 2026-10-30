import { MinusIcon, PenIcon } from './HeaderIcons.jsx'

const ICONS = { comment: PenIcon, remove: MinusIcon }

/** The icon that goes with a kind's word, never instead of it. */
export function IntentIcon({ intent, size = 14 }) {
  const Icon = ICONS[intent]
  return Icon ? <Icon size={size} /> : null
}
