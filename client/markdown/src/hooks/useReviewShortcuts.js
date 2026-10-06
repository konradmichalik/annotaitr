import { useEffect } from 'react'

export function useReviewShortcuts({ onSearch, onUndo, onRedo }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'textarea' || tag === 'input') {return}

      const isMod = e.metaKey || e.ctrlKey

      if (isMod && e.key === 'f') {
        e.preventDefault()
        onSearch()
        return
      }
      if (isMod && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        onUndo()
      }
      if (isMod && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        onRedo()
      }
      if (e.ctrlKey && !e.metaKey && e.key === 'y') {
        e.preventDefault()
        onRedo()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onSearch, onUndo, onRedo])
}
