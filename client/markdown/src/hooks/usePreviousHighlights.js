import { useCallback, useEffect, useState } from 'react'
import { previousQuoteRange } from '../utils/viewerDom.js'
import { flashElement } from '../utils/flashElement.js'

export const PREVIOUS_HIGHLIGHT = 'annotaitr-previous'
// Diagrams and math render after the blocks, so the ranges are taken once the page has settled.
const SETTLE_MS = 200

const viewer = () => document.querySelector('.viewer-article')

function scrollToThread(blocks, thread) {
  flashElement(previousQuoteRange(viewer(), blocks, thread)?.startContainer.parentElement)
}

/**
 * Last round's text notes in the active file, drawn as dashed, read-only
 * highlights through the CSS Custom Highlight API: no element is added, so
 * the page and this round's highlights stay untouched. Browsers without the
 * API show no highlight, the Replies tab still lists every thread.
 * Returns `locate(thread)`, which scrolls to a thread's text; a thread in
 * another file, or while the source view shows, asks `showFile(path)` first.
 */
export function usePreviousHighlights({ threads, path, blocks, enabled, showFile }) {
  const [pending, setPending] = useState(null)

  useEffect(() => {
    const registry = globalThis.CSS?.highlights
    if (!registry || typeof Highlight === 'undefined' || !enabled) { return }
    const timer = setTimeout(() => {
      const ranges = threads
        .filter((t) => t.place?.path === path)
        .map((t) => previousQuoteRange(viewer(), blocks, t))
        .filter(Boolean)
      registry.set(PREVIOUS_HIGHLIGHT, new Highlight(...ranges))
    }, SETTLE_MS)
    return () => {
      clearTimeout(timer)
      registry.delete(PREVIOUS_HIGHLIGHT)
    }
  }, [threads, path, blocks, enabled])

  useEffect(() => {
    if (!pending || !enabled || pending.place.path !== path) { return }
    const timer = setTimeout(() => {
      scrollToThread(blocks, pending)
      setPending(null)
    }, SETTLE_MS)
    return () => clearTimeout(timer)
  }, [pending, enabled, path, blocks])

  return useCallback((thread) => {
    if (thread.anchor === 'orphan' || !thread.place?.path) { return }
    if (thread.place.path !== path || !enabled) { showFile(thread.place.path) }
    setPending(thread)
  }, [enabled, path, showFile])
}
