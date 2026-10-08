import { useEffect } from 'react'
import { toolForKey } from '../utils/toolShortcuts.js'

/** One letter per tool among `tools`, Escape back to Select. Off while `disabled`. */
export function useToolShortcuts({ tools, disabled, onSelect }) {
  useEffect(() => {
    if (disabled) { return }
    const handleKeyDown = (event) => {
      const tool = toolForKey(event, tools)
      if (!tool) { return }
      if (event.key !== 'Escape') { event.preventDefault() }
      onSelect(tool)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tools, disabled, onSelect])
}
