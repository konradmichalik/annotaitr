import { MinusIcon, PenIcon, PlusIcon, QuestionIcon } from './HeaderIcons.jsx'

const ICONS = { change: PenIcon, add: PlusIcon, remove: MinusIcon, question: QuestionIcon }

/** The icon that goes with an intent's word, never instead of it. */
export function IntentIcon({ intent, size = 14 }) {
  const Icon = ICONS[intent]
  return Icon ? <Icon size={size} /> : null
}
