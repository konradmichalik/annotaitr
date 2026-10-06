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
 * How many pages a key press moves, or null when it is not a page key here:
 * while typing, with a modifier held (so Cmd+Z and friends keep working),
 * inside a menu (which uses Home and End itself) or when something else
 * already handled the key.
 */
export function pageStepFor(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) { return null }
  const target = event.target
  if (TEXT_ENTRY_TAGS.has(target?.tagName) || target?.closest?.('[role="menu"]')) { return null }
  return STEPS[event.key] ?? null
}

/** Page keys for a PDF: PageUp/PageDown and [ / ] move one page, Home and End jump to the first and last. */
export function useDocumentShortcuts({ enabled, disabled, onStep }) {
  useEffect(() => {
    if (!enabled) { return }
    const handleKeyDown = (event) => {
      if (disabled) { return }
      const step = pageStepFor(event)
      if (step === null) { return }
      event.preventDefault()
      onStep(step)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, disabled, onStep])
}
