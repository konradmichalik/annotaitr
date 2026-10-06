import { useEffect } from 'react'

/** Calls `onOutside` on a mousedown outside the element `ref` points to, only while `active`. */
export function useOutsideClick(ref, onOutside, active = true) {
  useEffect(() => {
    if (!active) { return }
    const handleClickOutside = (event) => {
      if (!ref.current?.contains(event.target)) { onOutside() }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [ref, onOutside, active])
}
