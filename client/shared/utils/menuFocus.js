const MENU_KEYS = { ArrowDown: 1, ArrowUp: -1 }

/**
 * Arrow keys, Home and End move focus between the `selector` items inside the
 * menu `list`, wrapping around. Any other key is left alone.
 */
export function moveMenuFocus(event, list, selector) {
  const items = [...list.querySelectorAll(selector)]
  if (items.length === 0) { return }
  const index = items.indexOf(document.activeElement)
  let next = null
  if (event.key in MENU_KEYS) { next = (index + MENU_KEYS[event.key] + items.length) % items.length }
  if (event.key === 'Home') { next = 0 }
  if (event.key === 'End') { next = items.length - 1 }
  if (next === null) { return }
  event.preventDefault()
  items[next].focus()
}
