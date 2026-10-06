import { useEffect } from 'react'
import { removeInsertionMarker } from '../utils/viewerDom.js'

const CURSOR_CLICK_SKIP_SELECTOR = '.annotation-toolbar, button, a[href], .code-copy-btn, .annotatable-image-wrapper, .diagram-render-area, .diagram-source, .diagram-controls, .block-note-border, .insertion-marker'

/**
 * Alt+Click places a temporary insertion marker at the caret and opens the toolbar on
 * it; a click on a saved insertion marker opens that annotation for editing.
 */
export function useInsertionClick({
  containerRef,
  toolbarState,
  setToolbarState,
  setRequestedToolbarStep,
  pendingSourceRef,
  isRestoringRef,
  annotationsRef,
  onSelectAnnotation,
}) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) { return }

    const handleCursorClick = (e) => {
      if (!e.altKey) { return }
      if (toolbarState) { return }
      if (pendingSourceRef.current) { return }
      if (isRestoringRef.current) { return }
      if (e.defaultPrevented) { return }
      if (e.target.closest(CURSOR_CLICK_SKIP_SELECTOR)) { return }

      requestAnimationFrame(() => {
        if (pendingSourceRef.current || toolbarState) { return }
        const sel = window.getSelection()
        if (!sel || !sel.isCollapsed || sel.rangeCount === 0) { return }
        const range = sel.getRangeAt(0)

        let blockEl = range.startContainer
        if (blockEl.nodeType === Node.TEXT_NODE) { blockEl = blockEl.parentElement }
        while (blockEl && !blockEl.dataset?.blockId) { blockEl = blockEl.parentElement }
        if (!blockEl || !container.contains(blockEl)) { return }
        if (range.startContainer.parentElement?.closest('[data-highlight-id]')) { return }

        const blockId = blockEl.dataset.blockId
        const blockText = blockEl.textContent || ''
        const preRange = document.createRange()
        preRange.selectNodeContents(blockEl)
        preRange.setEnd(range.startContainer, range.startOffset)
        const offset = preRange.toString().length
        const afterContext = blockText.slice(Math.max(0, offset - 50), offset)

        const marker = document.createElement('span')
        marker.className = 'insertion-marker-temp'
        marker.textContent = '​'
        range.insertNode(marker)

        setToolbarState({
          element: marker,
          insertionMode: true,
          insertionData: { blockId, offset, afterContext }
        })
      })
    }

    const handleInsertionMarkerClick = (e) => {
      const marker = e.target.closest('.insertion-marker[data-insertion-id]')
      if (!marker) { return }
      e.stopPropagation()
      const annId = marker.dataset.insertionId
      const ann = annotationsRef.current.find(a => a.id === annId)
      if (!ann) { return }
      onSelectAnnotation(annId)
      setToolbarState({ element: marker, annotation: ann, mode: 'edit', insertionEdit: true })
      setRequestedToolbarStep(null)
    }

    container.addEventListener('click', handleCursorClick)
    container.addEventListener('click', handleInsertionMarkerClick)

    return () => {
      container.querySelectorAll('.insertion-marker-temp').forEach(removeInsertionMarker)
      container.removeEventListener('click', handleCursorClick)
      container.removeEventListener('click', handleInsertionMarkerClick)
    }
  }, [onSelectAnnotation, toolbarState, setToolbarState, setRequestedToolbarStep, containerRef, pendingSourceRef, isRestoringRef, annotationsRef])
}
