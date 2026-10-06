import { useEffect } from 'react'

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const STEPS = {
  PageDown: 1,
  PageUp: -1,
  ']': 1,
  '[': -1,
  Home: -Infinity,
  End: Infinity
}

/**
 * Page keys for a PDF: PageUp/PageDown and [ / ] move one page, Home and End
 * jump to the first and last. Ignored while typing, with a modifier held (so
 * Cmd+Z and friends keep working) and while `disabled`.
 */
export function useDocumentShortcuts({ enabled, disabled, onStep }) {
  useEffect(() => {
    if (!enabled) { return }
    const handleKeyDown = (event) => {
      if (disabled || event.metaKey || event.ctrlKey || event.altKey) { return }
      if (TEXT_ENTRY_TAGS.has(document.activeElement?.tagName)) { return }
      const delta = STEPS[event.key]
      if (delta === undefined) { return }
      event.preventDefault()
      onStep(delta)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, disabled, onStep])
}
