import { useCallback, useEffect, useState } from 'react'

function isTyping(target) {
  return target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

function scrollToCard(path) {
  const selector = path === null ? '.change-overview' : `.change-file[data-path="${CSS.escape(path)}"]`
  document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * The changed file in view (`null` for the overview): picked in the tree or
 * with `J` and `K`, opened if it was collapsed and scrolled to the top.
 */
export function useChangesNavigation({ sections, expand }) {
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
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) { return }
      const key = e.key.toLowerCase()
      if (key !== 'j' && key !== 'k') { return }
      e.preventDefault()
      const index = order.indexOf(current)
      const next = Math.min(order.length - 1, Math.max(0, index + (key === 'j' ? 1 : -1)))
      select(order[next])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sections, current, select])

  return { current, select }
}
