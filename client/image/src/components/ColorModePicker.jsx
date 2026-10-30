import { useEffect, useRef } from 'react'
import { ANNOTATION_COLORS } from '../utils/annotationColors.js'
import { useDropdown } from '../../../shared/hooks/useDropdown.js'
import { moveMenuFocus } from '../../../shared/utils/menuFocus.js'

const MENU_ITEMS = '[role="menuitemradio"], [role="radio"]'

// The four mark colours in one swatch: a new mark takes the colour of its number.
const MARK_GRADIENT = 'conic-gradient(var(--mark-1) 0 25%, var(--mark-2) 0 50%, var(--mark-3) 0 75%, var(--mark-4) 0)'

/**
 * Dock dropdown for the ink newly drawn marks start with: none, so a mark
 * takes the colour of its number, or a fixed ink for visibility on a busy
 * image. Either way the composer can still change it. The stored mode keeps
 * its old name `intent`, a stored "rotate" reads as Automatic colour.
 */
export default function ColorModePicker({ colorMode, fixedColor, onChangeMode, onChangeColor }) {
  const { open, setOpen, toggle, wrapperRef } = useDropdown()
  const listRef = useRef(null)
  const triggerRef = useRef(null)
  const fixed = colorMode === 'fixed'

  useEffect(() => {
    if (open) { listRef.current?.querySelector('[aria-checked="true"]')?.focus() }
  }, [open])

  // Escape closes the menu only and hands focus back to the trigger.
  const handleKeyDown = (event) => {
    if (event.key !== 'Escape' || !open) { return }
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    triggerRef.current?.focus()
  }

  const triggerStyle = fixed ? { backgroundColor: fixedColor } : { background: MARK_GRADIENT }

  return (
    <div className="color-mode-picker" ref={wrapperRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        data-dock-item=""
        className="color-mode-trigger dock-button"
        onClick={toggle}
        title="Ink for new marks"
        aria-label="Ink for new marks"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="color-mode-swatch" style={triggerStyle} />
      </button>
      {open && (
        <div ref={listRef} className="color-mode-dropdown" role="menu" aria-label="Ink for new marks" onKeyDown={(event) => moveMenuFocus(event, listRef.current, MENU_ITEMS)}>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!fixed}
            className={`color-mode-option${!fixed ? ' color-mode-option--active' : ''}`}
            onClick={() => { onChangeMode('intent'); setOpen(false) }}
          >
            <span className="color-mode-swatch color-mode-swatch--sm" style={{ background: MARK_GRADIENT }} />
            Automatic colour
          </button>
          <div className="color-mode-dropdown-divider" />
          <div className="color-mode-swatches" role="radiogroup" aria-label="Fixed annotation color">
            {ANNOTATION_COLORS.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                role="radio"
                aria-checked={fixed && fixedColor === swatch.hex}
                className={`color-swatch${fixed && fixedColor === swatch.hex ? ' color-swatch--active' : ''}`}
                style={{ backgroundColor: swatch.hex }}
                title={swatch.id}
                onClick={() => { onChangeColor(swatch.hex); onChangeMode('fixed'); setOpen(false) }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
