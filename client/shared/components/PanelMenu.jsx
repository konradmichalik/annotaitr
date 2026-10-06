import { useEffect, useRef } from 'react'
import { useDropdown } from '../hooks/useDropdown.js'

const MENU_KEYS = { ArrowDown: 1, ArrowUp: -1 }

/** Arrow keys, Home and End move between the menu's enabled items, wrapping around. */
function moveFocus(event, list) {
  const items = [...list.querySelectorAll('[role="menuitem"]:not(:disabled)')]
  const index = items.indexOf(document.activeElement)
  let next = null
  if (event.key in MENU_KEYS) { next = (index + MENU_KEYS[event.key] + items.length) % items.length }
  if (event.key === 'Home') { next = 0 }
  if (event.key === 'End') { next = items.length - 1 }
  if (next === null) { return }
  event.preventDefault()
  items[next]?.focus()
}

/** Focus the first item when the menu opens, and the trigger again when it closes. */
function useMenuFocus(open, listRef, triggerRef) {
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) { listRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus() }
    if (!open && wasOpen.current) { triggerRef.current?.focus() }
    wasOpen.current = open
  }, [open, listRef, triggerRef])
}

/**
 * The "More actions" menu in the annotation panel header. Each item is
 * `{ id, label, onClick, icon?, disabled?, separated? }`; the menu closes
 * before an item's `onClick` runs.
 */
export function PanelMenu({ items }) {
  const { open, setOpen, toggle, wrapperRef } = useDropdown()
  const listRef = useRef(null)
  const triggerRef = useRef(null)
  useMenuFocus(open, listRef, triggerRef)

  return (
    <div className="panel-menu" ref={wrapperRef}>
      <button
        ref={triggerRef} type="button" className="panel-icon-btn" onClick={toggle}
        title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      {open && (
        <div ref={listRef} className="panel-menu-list" role="menu" aria-label="More actions" onKeyDown={(event) => moveFocus(event, listRef.current)}>
          {items.map(({ id, icon, label, disabled, separated, onClick }) => (
            <button
              key={id} type="button" role="menuitem" disabled={disabled}
              onClick={() => { setOpen(false); onClick() }}
              className={`panel-menu-item${separated ? ' panel-menu-item--separated' : ''}`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
