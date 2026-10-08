import { useCallback, useEffect, useRef, useState } from 'react'
import { isPlainKeyPress } from '../utils/keys.js'

const CLOSED = { open: false, draft: '', scope: null }

/**
 * The state behind the general comment, shared by its card in the list and its
 * row at the bottom. `onSave` gets the new text, empty to remove the comment.
 * `scope` names what the comment belongs to (the active markdown file): a
 * draft opened for one scope is discarded when the scope changes, so a save
 * can never reach another file.
 */
export function useGeneralComment({ text, onSave, disabled = false, scope = null }) {
  const [state, setState] = useState(CLOSED)
  const rowRef = useRef(null)
  const cardRef = useRef(null)
  const open = state.open && state.scope === scope

  useEffect(() => {
    if (state.open && state.scope !== scope) { setState(CLOSED) }
  }, [state, scope])

  const start = useCallback(() => setState({ open: true, draft: text ?? '', scope }), [text, scope])
  const setDraft = useCallback((draft) => setState((current) => ({ ...current, draft })), [])

  const close = useCallback(() => {
    setState(CLOSED)
    requestAnimationFrame(() => (cardRef.current ?? rowRef.current)?.focus())
  }, [])

  const save = useCallback(() => {
    if (!open) { return }
    onSave(state.draft.trim() ? state.draft : '')
    close()
  }, [open, onSave, state.draft, close])

  const remove = useCallback(() => {
    onSave('')
    requestAnimationFrame(() => rowRef.current?.focus())
  }, [onSave])

  useEffect(() => {
    if (disabled || open) { return }
    const handleKeyDown = (event) => {
      if (event.key.toLowerCase() !== 'g' || !isPlainKeyPress(event)) { return }
      event.preventDefault()
      start()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [disabled, open, start])

  return { text, open, draft: state.draft, setDraft, start, close, save, remove, rowRef, cardRef }
}
