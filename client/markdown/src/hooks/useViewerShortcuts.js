import { useEffect, useRef } from 'react'
import { getQuickLabels } from '../utils/quickLabels.js'

/**
 * Toolbar and search shortcuts while the rendered view is active: Cmd/Ctrl+D marks for
 * deletion, Cmd/Ctrl+K steps the toolbar, Escape closes it, F3 steps search matches and
 * Alt+1-0 applies a quick label.
 */
export function useViewerShortcuts({ toolbarState, setRequestedToolbarStep, search, crossFileSearch, onAnnotate, onClose, onQuickLabel }) {
  const annotateRef = useRef(onAnnotate)
  const closeRef = useRef(onClose)
  const quickLabelRef = useRef(onQuickLabel)
  annotateRef.current = onAnnotate
  closeRef.current = onClose
  quickLabelRef.current = onQuickLabel

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'textarea' || tag === 'input') { return }
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.key === 'd' && toolbarState) {
        e.preventDefault()
        annotateRef.current('DELETION')
      }
      if (isMod && e.key === 'k' && toolbarState) {
        e.preventDefault()
        setRequestedToolbarStep(prev => (prev ?? 0) + 1)
      }
      if (e.key === 'Escape' && toolbarState) {
        e.preventDefault()
        closeRef.current()
      }
      // Search shortcuts (work even without search input focus)
      const activeSearch = crossFileSearch || search
      if (activeSearch.isOpen) {
        if (e.key === 'F3') {
          e.preventDefault()
          activeSearch.stepMatch(e.shiftKey ? -1 : +1)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          activeSearch.closeSearch()
          return
        }
      }
      if (e.altKey && !isMod && toolbarState && toolbarState.mode !== 'edit') {
        const isDigit = e.code >= 'Digit1' && e.code <= 'Digit9' || e.code === 'Digit0'
        if (isDigit) {
          e.preventDefault()
          const labels = getQuickLabels()
          const index = e.code === 'Digit0' ? 9 : parseInt(e.code.replace('Digit', ''), 10) - 1
          if (index < labels.length) {
            quickLabelRef.current(labels[index])
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toolbarState, setRequestedToolbarStep, search.isOpen, search.stepMatch, search.closeSearch, crossFileSearch])
}
