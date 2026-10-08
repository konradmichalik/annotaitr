import { useState } from 'react'
import { stepElement, parentOf } from '../utils/elementWalk.js'

/**
 * The Element tool from the keyboard: the canvas takes focus, `Tab` and
 * `Shift+Tab` walk the page's elements in document order, `↑` goes to the
 * parent and `Enter` annotates the outlined one. Past the last (or before the
 * first) element Tab leaves the canvas as usual, so it is no keyboard trap.
 */
export function useElementWalk({ active, elements, onPick }) {
  const [current, setCurrent] = useState(null)
  if (!active || elements.length === 0) { return { current: null, canvasProps: {} } }

  const onKeyDown = (event) => {
    if (event.target !== event.currentTarget || event.altKey || event.metaKey || event.ctrlKey) { return }
    let next
    if (event.key === 'Tab') {
      // Without an element yet (focus came from a click) Shift+Tab simply leaves.
      if (!current && event.shiftKey) { return }
      next = stepElement(elements, current, event.shiftKey ? -1 : 1)
      if (!next) { setCurrent(null); return }
    } else if (event.key === 'ArrowUp' && current) {
      next = parentOf(elements, current)
      if (!next) { return }
    } else if (event.key === 'Enter' && current) {
      event.preventDefault()
      onPick(current)
      return
    } else {
      return
    }
    event.preventDefault()
    setCurrent(next)
  }

  const onFocus = (event) => {
    // A click focuses the canvas too; only keyboard focus starts the walk.
    if (event.target !== event.currentTarget || !event.currentTarget.matches(':focus-visible')) { return }
    const fromAfter = event.relatedTarget && (event.currentTarget.compareDocumentPosition(event.relatedTarget) & Node.DOCUMENT_POSITION_FOLLOWING)
    setCurrent(stepElement(elements, null, fromAfter ? -1 : 1))
  }

  return {
    current,
    canvasProps: {
      tabIndex: 0,
      'aria-label': 'Page elements. Tab walks the elements, Up arrow selects the parent, Enter annotates',
      onKeyDown,
      onFocus,
      onBlur: () => setCurrent(null)
    }
  }
}
