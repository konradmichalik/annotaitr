import { useState, useEffect } from 'react'

// Hold Shift to temporarily toggle pinpoint mode
// (Alt is reserved for insertion mode)
export function useShiftHeld() {
  const [shiftHeld, setShiftHeld] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Shift' || e.repeat) {return}
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'textarea' || tag === 'input') {return}
      if (document.querySelector('.annotation-toolbar, .comment-popover')) {return}
      setShiftHeld(true)
    }
    const handleKeyUp = (e) => {
      if (e.key !== 'Shift') {return}
      setShiftHeld(false)
    }
    const handleBlur = () => setShiftHeld(false)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  return shiftHeld
}
