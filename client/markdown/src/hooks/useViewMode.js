import { useCallback, useState } from 'react'

/**
 * The chosen view: 'preview', 'source' or 'changes' (since the last round).
 * The changes view belongs to the file it was opened on, so opening another
 * file returns to the preview; preview and source carry over.
 */
export function useViewMode(fileIndex) {
  const [state, setState] = useState({ mode: 'preview', fileIndex })
  const setMode = useCallback((mode) => setState((s) => ({ ...s, mode })), [])
  if (state.fileIndex !== fileIndex) {
    // Adjusted during render, so the next file never shows the changes view for a frame.
    const next = { mode: state.mode === 'changes' ? 'preview' : state.mode, fileIndex }
    setState(next)
    return [next.mode, setMode]
  }
  return [state.mode, setMode]
}
