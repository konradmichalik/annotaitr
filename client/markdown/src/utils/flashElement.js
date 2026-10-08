/** Scroll an element of the document into view and flash it, so the eye finds it. */
export function flashElement(el) {
  if (!el) { return }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.remove('flash-highlight')
  void el.offsetWidth
  el.classList.add('flash-highlight')
}
