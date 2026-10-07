import { useEffect } from 'react'
import { isShortcutListKey } from '../utils/keys.js'

/** `?` opens the shortcut list, except while typing or inside a menu or dialog. */
export function useShortcutListKey(onOpen, enabled = true) {
  useEffect(() => {
    if (!enabled) { return }
    const handleKeyDown = (event) => {
      if (!isShortcutListKey(event)) { return }
      event.preventDefault()
      onOpen()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onOpen, enabled])
}
