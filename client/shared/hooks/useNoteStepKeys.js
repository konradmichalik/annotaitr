import { useEffect } from 'react'
import { noteStepKey } from '../utils/keys.js'

/** `N` and `Shift+N` call `onStep(1)` and `onStep(-1)`, except while typing or inside a menu or dialog. */
export function useNoteStepKeys(onStep, enabled = true) {
  useEffect(() => {
    if (!enabled) { return undefined }
    const handleKeyDown = (event) => {
      const delta = noteStepKey(event)
      if (delta === 0) { return }
      event.preventDefault()
      onStep(delta)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onStep, enabled])
}
