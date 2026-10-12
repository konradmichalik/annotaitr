import { useState, useEffect } from 'react'

// Hold Shift to temporarily toggle pinpoint mode
// (Alt is reserved for insertion mode)

// Shift+N steps to the previous note: a key that joins Shift within this time is a shortcut, not a hold.
const HOLD_DELAY_MS = 150

export function useShiftHeld() {
  const [shiftHeld, setShiftHeld] = useState(false)

  useEffect(() => {
    let timer = null
    const cancel = () => {
      clearTimeout(timer)
      timer = null
    }
    const release = () => {
      cancel()
      setShiftHeld(false)
    }
    const handleKeyDown = (e) => {
      if (e.key !== 'Shift') { cancel(); return }
      if (e.repeat) {return}
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'textarea' || tag === 'input') {return}
      if (document.querySelector('.annotation-toolbar, .comment-popover')) {return}
      timer = setTimeout(() => setShiftHeld(true), HOLD_DELAY_MS)
    }
    const handleKeyUp = (e) => {
      if (e.key !== 'Shift') {return}
      release()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', release)
    return () => {
      cancel()
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', release)
    }
  }, [])

  return shiftHeld
}
