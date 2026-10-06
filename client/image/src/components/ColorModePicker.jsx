import { ANNOTATION_COLORS } from '../utils/annotationColors.js'
import { useDropdown } from '../../../shared/hooks/useDropdown.js'

const ROTATE_GRADIENT = `conic-gradient(${ANNOTATION_COLORS.map((c) => c.hex).join(', ')}, ${ANNOTATION_COLORS[0].hex})`

/**
 * Toolbar dropdown for the color newly drawn annotations start with:
 * "Rotate" cycles through the palette (shown as a rainbow swatch), or a
 * fixed color can be picked here instead. Either way this only sets the
 * starting color - the comment popover still lets it be changed per
 * annotation afterwards.
 */
export default function ColorModePicker({ colorMode, fixedColor, onChangeMode, onChangeColor }) {
  const { open, setOpen, toggle, wrapperRef } = useDropdown()

  const triggerStyle = colorMode === 'rotate' ? { background: ROTATE_GRADIENT } : { backgroundColor: fixedColor }

  return (
    <div className="color-mode-picker" ref={wrapperRef}>
      <button
        type="button"
        className="color-mode-trigger"
        onClick={toggle}
        title="New annotation color"
        aria-label="New annotation color"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="color-mode-swatch" style={triggerStyle} />
      </button>
      {open && (
        <div className="color-mode-dropdown" role="menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={colorMode === 'rotate'}
            className={`color-mode-option${colorMode === 'rotate' ? ' color-mode-option--active' : ''}`}
            onClick={() => { onChangeMode('rotate'); setOpen(false) }}
          >
            <span className="color-mode-swatch color-mode-swatch--sm" style={{ background: ROTATE_GRADIENT }} />
            Rotate
          </button>
          <div className="color-mode-dropdown-divider" />
          <div className="color-mode-swatches" role="radiogroup" aria-label="Fixed annotation color">
            {ANNOTATION_COLORS.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                role="radio"
                aria-checked={colorMode === 'fixed' && fixedColor === swatch.hex}
                className={`color-swatch${colorMode === 'fixed' && fixedColor === swatch.hex ? ' color-swatch--active' : ''}`}
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
