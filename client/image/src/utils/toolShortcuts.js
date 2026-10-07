import { isPlainKeyPress } from '../../../shared/utils/keys.js'

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
