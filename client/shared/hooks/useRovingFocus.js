import { useLayoutEffect, useRef } from 'react'

const ITEM = '[data-dock-item]:not(:disabled)'
const STEPS = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }

/**
 * Roving tabindex for a toolbar: Tab reaches it once, on the item last used
 * (or the pressed one), and the arrow keys, Home and End move between its
 * items. Items are the descendants marked `data-dock-item`, so a control
 * rendered by another component can take part through that attribute.
 */
export function useRovingFocus() {
  const ref = useRef(null)
  const lastRef = useRef(null)

  useLayoutEffect(() => {
    const items = [...(ref.current?.querySelectorAll(ITEM) ?? [])]
    if (items.length === 0) { return }
    const current = items.find((item) => item === lastRef.current)
      ?? items.find((item) => item.getAttribute('aria-pressed') === 'true')
      ?? items[0]
    items.forEach((item) => { item.tabIndex = item === current ? 0 : -1 })
  })

  const onFocus = (event) => {
    if (!event.target.matches?.(ITEM)) { return }
    lastRef.current = event.target
    ref.current.querySelectorAll(ITEM).forEach((item) => { item.tabIndex = item === event.target ? 0 : -1 })
  }

  const onKeyDown = (event) => {
    if (event.altKey || event.metaKey || event.ctrlKey || !event.target.matches?.(ITEM)) { return }
    const items = [...ref.current.querySelectorAll(ITEM)]
    const index = items.indexOf(event.target)
    let next = null
    if (event.key in STEPS) { next = items[(index + STEPS[event.key] + items.length) % items.length] }
    if (event.key === 'Home') { next = items[0] }
    if (event.key === 'End') { next = items.at(-1) }
    if (!next) { return }
    event.preventDefault()
    next.focus()
  }

  return { ref, onFocus, onKeyDown }
}
