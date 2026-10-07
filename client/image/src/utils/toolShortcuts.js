import { isPlainKeyPress } from '../../../shared/utils/keys.js'
import { intentForKey, intentOf } from '../../../shared/utils/intents.js'

/** The key cap of each tool, as listed in docs/design/rules.md. */
export const TOOL_KEYS = {
  select: 'V',
  element: 'E',
  text: 'T',
  box: 'R',
  arrow: 'A',
  freehand: 'P',
  highlighter: 'H',
  pin: 'C'
}

const TOOLS_BY_KEY = Object.fromEntries(Object.entries(TOOL_KEYS).map(([tool, key]) => [key.toLowerCase(), tool]))

/** The tool a key press picks among `tools` (the ones the mode offers), or null. Escape goes back to Select. */
export function toolForKey(event, tools) {
  if (!isPlainKeyPress(event)) { return null }
  const tool = event.key === 'Escape' ? 'select' : TOOLS_BY_KEY[event.key.toLowerCase()]
  return tool && tools.includes(tool) ? tool : null
}

/**
 * The intent a key from 1 to 4 gives the mark selected on the canvas, or null:
 * not while typing or inside the composer (it switches its own chip there),
 * not for a general comment and not when the mark already has that intent.
 */
export function intentChangeForKey(event, annotation) {
  if (!annotation || !isPlainKeyPress(event)) { return null }
  const current = intentOf(annotation)
  const intent = intentForKey(event.key)
  return current && intent && intent !== current ? intent : null
}
