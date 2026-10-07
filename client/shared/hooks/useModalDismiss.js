import { useEffect } from 'react'

/**
 * While a modal is open: Escape closes it, focus moves into `dialogRef`, and
 * on close focus goes back to whatever had it before the modal opened.
 * A caller that knows better where focus belongs passes `restoreFocus: false`.
 */
export function useModalDismiss(isOpen, onClose, dialogRef, { restoreFocus = true } = {}) {
  useEffect(() => {
    if (!isOpen) { return }
    const previouslyFocused = document.activeElement
    const handleEscape = (event) => {
      if (event.key === 'Escape') { onClose() }
    }
    document.addEventListener('keydown', handleEscape)
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handleEscape)
      if (restoreFocus) { previouslyFocused?.focus?.() }
    }
  }, [isOpen, onClose, dialogRef, restoreFocus])
}
