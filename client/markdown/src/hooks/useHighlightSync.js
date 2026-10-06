import { useEffect, useRef } from 'react'

// Element annotations (image/diagram) and global comments have no web-highlighter DOM
const hasNoHighlighter = (ann) =>
  ann?.targetType === 'image' || ann?.targetType === 'diagram' ||
  ann?.targetType === 'global'

function applyLastAction(viewer, lastAction) {
  if (lastAction.type === 'delete') {
    if (!hasNoHighlighter(lastAction.annotation)) {
      viewer?.removeHighlight(lastAction.annotation.id)
    }
  } else if (lastAction.type === 'edit') {
    if (!hasNoHighlighter(lastAction.updated)) {
      viewer?.updateHighlightType(lastAction.updated.id, lastAction.updated.type)
    }
  } else if (lastAction.type === 'undo') {
    const { entry } = lastAction
    if (hasNoHighlighter(entry.annotation)) {/* no-op for element annotations */}
    else if (entry.action === 'add') {
      viewer?.removeHighlight(entry.annotation.id)
    } else if (entry.action === 'delete') {
      viewer?.restoreHighlight(entry.annotation)
    } else if (entry.action === 'edit') {
      viewer?.updateHighlightType(entry.annotation.id, entry.annotation.type)
    }
  } else if (lastAction.type === 'redo') {
    const { entry } = lastAction
    if (hasNoHighlighter(entry.annotation)) {/* no-op for element annotations */}
    else if (entry.action === 'add') {
      viewer?.restoreHighlight(entry.annotation)
    } else if (entry.action === 'delete') {
      viewer?.removeHighlight(entry.annotation.id)
    } else if (entry.action === 'edit') {
      viewer?.updateHighlightType(entry.updated.id, entry.updated.type)
    }
  }
}

/**
 * Keeps the viewer's highlight DOM in step with the active file's annotation state:
 * mirrors each reducer action, and restores all highlights after a file or view
 * switch remounts the Viewer/SourceView (via key).
 */
export function useHighlightSync({ viewerRef, annState, activeFileIndex, viewMode, onFileChange }) {
  const prevLastActionRef = useRef(null)
  const prevFileIndexRef = useRef(activeFileIndex)
  const prevViewModeRef = useRef(viewMode)
  const { annotations } = annState

  useEffect(() => {
    const { lastAction } = annState
    if (!lastAction || lastAction === prevLastActionRef.current) {return}
    prevLastActionRef.current = lastAction
    applyLastAction(viewerRef.current, lastAction)
  }, [annState, viewerRef])

  useEffect(() => {
    const fileChanged = prevFileIndexRef.current !== activeFileIndex
    const viewChanged = prevViewModeRef.current !== viewMode
    if (!fileChanged && !viewChanged) {return}
    prevFileIndexRef.current = activeFileIndex
    prevViewModeRef.current = viewMode
    if (fileChanged) {
      prevLastActionRef.current = null
      onFileChange()
    }

    if (annotations.length > 0) {
      const timer = setTimeout(() => {
        viewerRef.current?.restoreHighlights(annotations)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [activeFileIndex, annotations, viewMode, viewerRef, onFileChange])
}
