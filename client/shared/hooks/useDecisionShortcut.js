import { useEffect } from 'react'

/** ⌘/Ctrl+Shift+Enter opens the decision dialog from anywhere, also from inside a text field. */
export function useDecisionShortcut(onOpen, enabled = true) {
  useEffect(() => {
    if (!enabled) { return }
    const handleKeyDown = (event) => {
      if (event.key !== 'Enter' || !event.shiftKey || !(event.metaKey || event.ctrlKey) || event.isComposing) { return }
      event.preventDefault()
      onOpen()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onOpen, enabled])
}
