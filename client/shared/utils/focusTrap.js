const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

// Tab reaches only the checked radio of a group and skips what a roving tabindex took out of the order.
const isTabStop = (el) => !(el.type === 'radio' && !el.checked) && el.tabIndex >= 0

/** Keeps Tab and Shift+Tab inside `container` while a modal dialog is open. */
export function trapTab(event, container) {
  if (event.key !== 'Tab' || !container) { return }
  const items = [...container.querySelectorAll(FOCUSABLE)].filter(isTabStop)
  if (items.length === 0) { return }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  const outside = !container.contains(active) || active === container
  if (event.shiftKey && (active === first || outside)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || outside)) {
    event.preventDefault()
    first.focus()
  }
}
