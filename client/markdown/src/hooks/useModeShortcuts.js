import { useEffect } from 'react'
import { isPlainKeyPress } from '../../../shared/utils/keys.js'

const MODES_BY_KEY = { v: 'select', c: 'pinpoint' }

/** The mode a key press switches to: V for Select text, C for Pinpoint, or null. */
export function modeForKey(event) {
  if (!isPlainKeyPress(event)) { return null }
  return MODES_BY_KEY[event.key.toLowerCase()] ?? null
}

/** V and C switch between Select text and Pinpoint, except while a selection menu or comment is open. */
export function useModeShortcuts({ disabled, onChange }) {
  useEffect(() => {
    if (disabled) { return }
    const handleKeyDown = (event) => {
      const mode = modeForKey(event)
      if (!mode || document.querySelector('.annotation-toolbar, .comment-popover')) { return }
      event.preventDefault()
      onChange(mode)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [disabled, onChange])
}
