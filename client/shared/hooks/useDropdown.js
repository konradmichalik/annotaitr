import { useState, useRef, useEffect, useCallback } from 'react'
import { useOutsideClick } from './useOutsideClick.js'

/**
 * Open/close state and dismissal behavior shared by every small dropdown
 * picker in the app (color mode, and the popover's color/arrow-style/width
 * pickers): a mousedown outside `wrapperRef`'s element or an Escape key
 * closes it. The caller attaches `wrapperRef` to the dropdown's root element.
 */
export function useDropdown() {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)
  const close = useCallback(() => setOpen(false), [])

  useOutsideClick(wrapperRef, close, open)

  useEffect(() => {
    if (!open) { return }
    const handleEscape = (event) => {
      if (event.key === 'Escape') { setOpen(false) }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  return { open, setOpen, toggle: () => setOpen((o) => !o), wrapperRef }
}
