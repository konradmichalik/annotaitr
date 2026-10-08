/**
 * The keyboard shortcuts of every mode, the one list the settings dialog
 * filters by the mode that is open. `kinds` names the modes a shortcut
 * belongs to; a range such as 1 to 4 is a `range` of two keys.
 */
import { MOD, ALT } from './keys.js'

const IMAGE = ['image', 'url', 'pdf', 'video']
const ALL = [...IMAGE, 'markdown']

/** The mode name the shortcut list shows next to its title. */
export const KIND_LABELS = { image: 'images', url: 'web pages', pdf: 'PDFs', video: 'videos', markdown: 'Markdown' }

const GROUPS = [
  {
    id: 'tools',
    title: 'Tools',
    items: [
      { label: 'Select', keys: ['V'], kinds: IMAGE },
      { label: 'Element', keys: ['E'], kinds: ['url', 'pdf'] },
      { label: 'Next element, parent (Element tool, canvas focused)', keys: ['Tab', '↑'], kinds: ['url', 'pdf'] },
      { label: 'Text', keys: ['T'], kinds: ['pdf'] },
      { label: 'Box', keys: ['R'], kinds: IMAGE },
      { label: 'Arrow', keys: ['A'], kinds: IMAGE },
      { label: 'Freehand', keys: ['P'], kinds: IMAGE },
      { label: 'Highlighter', keys: ['H'], kinds: IMAGE },
      { label: 'Pin comment', keys: ['C'], kinds: IMAGE },
      { label: 'Back to Select', keys: ['Esc'], kinds: IMAGE },
      { label: 'Select text', keys: ['V'], kinds: ['markdown'] },
      { label: 'Pinpoint', keys: ['C'], kinds: ['markdown'] },
      { label: 'Other mode while held', keys: ['Shift'], kinds: ['markdown'] },
      { label: 'Insert text at a position', keys: [ALT, 'Click'], kinds: ['markdown'] }
    ]
  },
  {
    id: 'notes',
    title: 'Notes',
    items: [
      { label: 'Save note', keys: [MOD, '↵'], kinds: ALL },
      { label: 'Pick intent', keys: ['1', '4'], range: true, kinds: ALL },
      { label: 'Change on the selection', keys: [MOD, 'K'], kinds: ['markdown'] },
      { label: 'Remove the selection', keys: [MOD, 'D'], kinds: ['markdown'] },
      { label: 'Quick label on the selection', keys: [ALT, '1', '0'], range: true, kinds: ['markdown'] },
      { label: 'General comment', keys: ['G'], kinds: ALL },
      { label: 'Intent of the selected note', keys: ['1', '4'], range: true, kinds: IMAGE },
      { label: 'Delete selected', keys: ['⌫'], kinds: IMAGE },
      { label: 'Discard the note being written', keys: ['Esc'], kinds: ALL },
      { label: 'Undo', keys: [MOD, 'Z'], kinds: ALL },
      { label: 'Redo', keys: [MOD, '⇧', 'Z'], kinds: ALL }
    ]
  },
  {
    id: 'pages',
    title: 'Pages',
    items: [
      { label: 'Previous, next page', keys: ['[', ']'], kinds: ['pdf'] },
      { label: 'First, last page', keys: ['Home', 'End'], kinds: ['pdf'] },
      { label: 'Zoom', keys: [MOD, 'Scroll'], kinds: ['pdf'] }
    ]
  },
  {
    id: 'view',
    title: 'View',
    items: [
      { label: 'Zoom', keys: [MOD, 'Scroll'], kinds: ['image', 'url'] }
    ]
  },
  {
    id: 'timeline',
    title: 'Timeline',
    items: [
      { label: 'Play, pause', keys: ['Space'], kinds: ['video'] },
      { label: 'One frame back, forward', keys: ['←', '→'], kinds: ['video'] },
      { label: 'Span in, out', keys: ['I', 'O'], kinds: ['video'] },
      { label: 'Zoom', keys: [MOD, 'Scroll'], kinds: ['video'] }
    ]
  },
  {
    id: 'search',
    title: 'Search',
    items: [
      { label: 'Search the document', keys: [MOD, 'F'], kinds: ['markdown'] },
      { label: 'Next match', keys: ['↵'], kinds: ['markdown'] },
      { label: 'Previous match', keys: ['⇧', '↵'], kinds: ['markdown'] }
    ]
  },
  {
    id: 'review',
    title: 'Review',
    items: [
      { label: 'Finish review', keys: [MOD, '⇧', '↵'], kinds: ALL },
      { label: 'Submit the open dialog', keys: [MOD, '↵'], kinds: ALL },
      { label: 'This list', keys: ['?'], kinds: ALL }
    ]
  }
]

const keyText = (item) => (item.range ? `${item.keys.slice(0, -1).join(' ')} ${item.keys.at(-1)}` : item.keys.join(' '))

/**
 * The groups of the open mode, each with only its shortcuts that match
 * `query` (in the label or the keys). Groups left empty are dropped.
 */
export function shortcutGroups(kind, query = '') {
  const needle = query.trim().toLowerCase()
  const matches = (item) => !needle || item.label.toLowerCase().includes(needle) || keyText(item).toLowerCase().includes(needle)
  return GROUPS
    .map(({ items, ...group }) => ({ ...group, items: items.filter((item) => item.kinds.includes(kind) && matches(item)) }))
    .filter((group) => group.items.length > 0)
}
