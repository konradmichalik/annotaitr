import { useEffect } from 'react'

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * Player keys: Space play/pause, arrows step one frame (Shift: one second),
 * I and O set the start and end of a span, M mutes. Ignored while typing, with a
 * modifier held (so Cmd+Z and friends keep working) and while `disabled`.
 */
export function useTimelineShortcuts({ controller, disabled, onMarkStart, onMarkEnd }) {
  useEffect(() => {
    if (!controller) { return }
    const handleKeyDown = (event) => {
      if (disabled || event.metaKey || event.ctrlKey || event.altKey) { return }
      const tag = document.activeElement?.tagName
      if (TEXT_ENTRY_TAGS.has(tag)) { return }
      const key = event.key
      if (key === ' ') {
        // A focused button already activates on Space.
        if (tag === 'BUTTON') { return }
        event.preventDefault()
        controller.togglePlay()
      } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault()
        const direction = key === 'ArrowLeft' ? -1 : 1
        if (event.shiftKey) {
          controller.seek(controller.getState().currentTime + direction)
        } else {
          controller.step(direction)
        }
      } else if (key.toLowerCase() === 'i') {
        event.preventDefault()
        onMarkStart()
      } else if (key.toLowerCase() === 'o') {
        event.preventDefault()
        onMarkEnd()
      } else if (key.toLowerCase() === 'm') {
        const { hasAudio, muted } = controller.getState()
        if (!hasAudio) { return }
        event.preventDefault()
        controller.setMuted(!muted)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [controller, disabled, onMarkStart, onMarkEnd])
}
