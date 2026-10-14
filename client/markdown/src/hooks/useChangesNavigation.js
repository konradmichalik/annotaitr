import { useCallback, useEffect, useState } from 'react'
import { isPlainKeyPress } from '../../../shared/utils/keys.js'

function scrollToCard(path) {
  const selector = path === null ? '.change-overview' : `.change-file[data-path="${CSS.escape(path)}"]`
  document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Any other key while the selection bar or a comment is open starts or edits the comment.
const isComposing = () => document.querySelector('.annotation-toolbar, .comment-popover') !== null

/**
 * The changed file in view (`null` for the overview): picked in the tree or
 * with `J` and `K`, opened if it was collapsed and scrolled to the top. `P`
 * hands the current file to `onCycleView`, which switches Diff and Read.
 */
export function useChangesNavigation({ sections, expand, onCycleView }) {
  const [current, setCurrent] = useState(null)

  const select = useCallback((path) => {
    setCurrent(path)
    if (path !== null) { expand(path) }
    requestAnimationFrame(() => scrollToCard(path))
  }, [expand])

  useEffect(() => {
    if (!sections) { return undefined }
    const order = [null, ...sections.files.map((f) => f.path)]
    const onKeyDown = (e) => {
      if (!isPlainKeyPress(e)) { return }
      const key = e.key.toLowerCase()
      if (key === 'p') {
        if (current === null || isComposing()) { return }
        if (onCycleView?.(current)) { e.preventDefault() }
        return
      }
      if (key !== 'j' && key !== 'k') { return }
      e.preventDefault()
      const index = order.indexOf(current)
      const next = Math.min(order.length - 1, Math.max(0, index + (key === 'j' ? 1 : -1)))
      select(order[next])
    }
    // Capture, so P sees the selection bar before its own key handler turns it into a comment.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [sections, current, select, onCycleView])

  return { current, select }
}
