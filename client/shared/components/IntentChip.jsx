import { useEffect, useRef } from 'react'
import { useDropdown } from '../hooks/useDropdown.js'
import { INTENTS, intentWord } from '../utils/intents.js'
import { IntentIcon } from './IntentIcon.jsx'
import { ChevronDownIcon } from './HeaderIcons.jsx'

const MENU_KEYS = { ArrowDown: 1, ArrowUp: -1 }

function moveFocus(event, list) {
  const items = [...list.querySelectorAll('[role="menuitemradio"]')]
  const index = items.indexOf(document.activeElement)
  let next = null
  if (event.key in MENU_KEYS) { next = (index + MENU_KEYS[event.key] + items.length) % items.length }
  if (event.key === 'Home') { next = 0 }
  if (event.key === 'End') { next = items.length - 1 }
  if (next === null) { return }
  event.preventDefault()
  items[next]?.focus()
}

/**
 * The intent of the note in the composer footer: `✎ Change ▾`, opening a menu
 * of the four intents. The keys 1 to 4 are handled by the composer, so they
 * also work on this button and in the menu, but never in the text field.
 */
export function IntentChip({ intent, onChange }) {
  const { open, setOpen, toggle, wrapperRef } = useDropdown()
  const listRef = useRef(null)
  const triggerRef = useRef(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open) { listRef.current?.querySelector('[aria-checked="true"]')?.focus() }
    if (!open && wasOpen.current && wrapperRef.current?.contains(document.activeElement)) { triggerRef.current?.focus() }
    wasOpen.current = open
  }, [open, wrapperRef])

  // Escape closes the menu only, not the composer around it.
  const handleKeyDown = (event) => {
    if (event.key !== 'Escape' || !open) { return }
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    triggerRef.current?.focus()
  }

  const pick = (id) => {
    onChange(id)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="intent-chip" ref={wrapperRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={`intent-chip-trigger intent-chip-trigger--${intent}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Intent: ${intentWord(intent)}`}
        title="Intent (keys 1 to 4 outside the text field)"
        onClick={toggle}
      >
        <IntentIcon intent={intent} />
        <span>{intentWord(intent)}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div ref={listRef} className="intent-chip-menu" role="menu" aria-label="Intent" onKeyDown={(event) => moveFocus(event, listRef.current)}>
          {INTENTS.map(({ id, word, key }) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={id === intent}
              aria-keyshortcuts={key}
              className={`intent-chip-item intent-chip-item--${id}`}
              onClick={() => pick(id)}
            >
              <IntentIcon intent={id} />
              <span className="intent-chip-word">{word}</span>
              <kbd className="key-cap" aria-hidden="true">{key}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
