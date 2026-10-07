import { useId } from 'react'
import { ANNOTATION_COLORS } from '../utils/annotationColors.js'
import { ARROW_STYLE_ICONS } from '../utils/icons.jsx'
import { ARROW_STYLES, STYLE_FIELDS, presetsFor, DASH_STYLES } from '../utils/annotationStyles.js'
import { useDropdown } from '../../../shared/hooks/useDropdown.js'
import { PaletteIcon } from '../../../shared/components/HeaderIcons.jsx'

// Fixed dash patterns for the picker's own icons, independent of the
// proportional dash math used for real rendering: they only need to read at 16px.
const DASH_ICON_PATTERN = { solid: undefined, dashed: '4 2', dotted: '1 2' }

const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1)

function LinePreviewIcon({ width, dash }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  )
}

/** One labelled row of radio buttons: the colour swatches or the icon options. */
function OptionRow({ label, options }) {
  const labelId = useId()
  return (
    <div className="style-palette-row">
      <span id={labelId} className="style-palette-label">{label}</span>
      <div className="style-palette-options" role="radiogroup" aria-labelledby={labelId}>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={option.active}
            aria-label={option.label}
            title={option.label}
            className={`style-palette-option${option.swatch ? ' style-palette-option--swatch' : ''}`}
            style={option.swatch ? { '--swatch': option.swatch } : undefined}
            onClick={option.onSelect}
          >
            {option.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Ink and stroke of a mark, collapsed behind one palette button in the
 * composer footer. Escape closes only the palette, not the composer around it.
 */
export default function StylePalette({ annotationType, style, onChange }) {
  const { open, setOpen, toggle, wrapperRef } = useDropdown()
  const panelId = useId()
  const fields = STYLE_FIELDS[annotationType] || []
  const presets = presetsFor(annotationType)
  // Presets range from 2 to 26, capped so the option icons stay legible at 16px.
  const previewWidth = (value) => Math.max(1, Math.min(8, value / 3))

  const handleKeyDown = (event) => {
    if (event.key !== 'Escape' || !open) { return }
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    wrapperRef.current?.querySelector('.style-palette-trigger')?.focus()
  }

  return (
    <div className="style-palette" ref={wrapperRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="composer-icon-button style-palette-trigger"
        aria-label="Ink and stroke"
        title="Ink and stroke"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <PaletteIcon />
        <span className="style-palette-current" style={{ '--swatch': style.color }} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="style-palette-panel" role="group" aria-label="Ink and stroke">
          <OptionRow
            label="Ink"
            options={ANNOTATION_COLORS.map((swatch) => ({
              key: swatch.id, label: capitalize(swatch.id), swatch: swatch.hex,
              active: style.color === swatch.hex, onSelect: () => onChange({ color: swatch.hex })
            }))}
          />
          {fields.includes('strokeWidth') && (
            <OptionRow
              label={annotationType === 'highlighter' ? 'Stripe size' : 'Line width'}
              options={presets.map((preset) => ({
                key: preset.id, label: preset.label, icon: <LinePreviewIcon width={previewWidth(preset.value)} />,
                active: style.strokeWidth === preset.value, onSelect: () => onChange({ strokeWidth: preset.value })
              }))}
            />
          )}
          {fields.includes('dashStyle') && (
            <OptionRow
              label="Line style"
              options={DASH_STYLES.map((dash) => ({
                key: dash.id, label: dash.label, icon: <LinePreviewIcon width={2} dash={DASH_ICON_PATTERN[dash.id]} />,
                active: style.dashStyle === dash.id, onSelect: () => onChange({ dashStyle: dash.id })
              }))}
            />
          )}
          {fields.includes('arrowStyle') && (
            <OptionRow
              label="Arrow end"
              options={ARROW_STYLES.map((arrow) => ({
                key: arrow.id, label: arrow.label, icon: ARROW_STYLE_ICONS[arrow.id],
                active: style.arrowStyle === arrow.id, onSelect: () => onChange({ arrowStyle: arrow.id })
              }))}
            />
          )}
        </div>
      )}
    </div>
  )
}
