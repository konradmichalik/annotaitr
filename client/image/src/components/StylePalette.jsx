import { useId } from 'react'
import { ANNOTATION_COLORS } from '../utils/annotationColors.js'
import { ARROW_STYLE_ICONS } from '../utils/icons.jsx'
import { ARROW_STYLES, STYLE_FIELDS, presetsFor, DASH_STYLES } from '../utils/annotationStyles.js'
import { useDropdown } from '../../../shared/hooks/useDropdown.js'
import { PaletteIcon } from '../../../shared/components/HeaderIcons.jsx'

// Fixed patterns for the picker's own icons, independent of the proportional
// dash math used for real rendering: they only need to read at 16px. Round caps
// would close the dashes' gaps, so dashes are butt-ended and dots are round caps
// on zero-length dashes.
const DASH_ICON = {
  solid: { cap: 'round' },
  dashed: { dash: '4 3', cap: 'butt' },
  dotted: { dash: '0 3.5', cap: 'round' }
}

// Thin, medium and thick as they read at 16px, whatever the real widths of the mark type are.
const PREVIEW_WIDTHS = [1.5, 3, 5]

const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1)

// No ink: the mark takes its intent's colour.
const INTENT_SWATCH = 'conic-gradient(var(--intent-change-mark) 0 25%, var(--intent-add-mark) 0 50%, var(--intent-remove-mark) 0 75%, var(--intent-question-mark) 0)'

function LinePreviewIcon({ width, dash, cap = 'round' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth={width} strokeLinecap={cap} strokeDasharray={dash} />
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
        <span className="style-palette-current" style={{ '--swatch': style.color || INTENT_SWATCH }} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="style-palette-panel" role="group" aria-label="Ink and stroke">
          <OptionRow
            label="Ink"
            options={[
              { key: 'intent', label: 'Intent colour', swatch: INTENT_SWATCH, active: !style.color, onSelect: () => onChange({ color: null }) },
              ...ANNOTATION_COLORS.map((swatch) => ({
                key: swatch.id, label: capitalize(swatch.id), swatch: swatch.hex,
                active: style.color === swatch.hex, onSelect: () => onChange({ color: swatch.hex })
              }))
            ]}
          />
          {fields.includes('strokeWidth') && (
            <OptionRow
              label={annotationType === 'highlighter' ? 'Stripe size' : 'Line width'}
              options={presets.map((preset, index) => ({
                key: preset.id, label: preset.label, icon: <LinePreviewIcon width={PREVIEW_WIDTHS[index]} />,
                active: style.strokeWidth === preset.value, onSelect: () => onChange({ strokeWidth: preset.value })
              }))}
            />
          )}
          {fields.includes('dashStyle') && (
            <OptionRow
              label="Line style"
              options={DASH_STYLES.map((dash) => ({
                key: dash.id, label: dash.label, icon: <LinePreviewIcon width={2} {...DASH_ICON[dash.id]} />,
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
