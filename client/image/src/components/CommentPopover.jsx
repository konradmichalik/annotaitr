import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ANNOTATION_COLORS } from '../utils/annotationColors.js'
import { ARROW_STYLE_ICONS, TOOL_ICONS } from '../utils/icons.jsx'
import {
  ARROW_STYLES, resolveArrowStyle, STYLE_FIELDS, presetsFor, strokeWidthOf, DASH_STYLES
} from '../utils/annotationStyles.js'
import { useDropdown } from '../hooks/useDropdown.js'
import { useOutsideClick } from '../hooks/useOutsideClick.js'
import VoiceNoteButton from './VoiceNoteButton.jsx'

const POPOVER_WIDTH = 280
const POPOVER_HEIGHT_ESTIMATE = 150
const GAP = 12

// Fixed dash patterns for the dash-style picker's own icons, independent of
// dashArrayFor's proportional-to-strokeWidth math used for real rendering -
// these just need to read clearly at a constant 16x16 icon size.
const DASH_ICON_PATTERN = { solid: undefined, dashed: '4 2', dotted: '1 2' }

/**
 * Places the popover below the annotated element by default (so it never
 * covers what it's talking about), flipping above only when there isn't
 * enough room below the anchor point.
 */
function computePosition(anchorPoint) {
  let left = anchorPoint.x - POPOVER_WIDTH / 2
  left = Math.max(16, Math.min(left, window.innerWidth - POPOVER_WIDTH - 16))

  const spaceBelow = window.innerHeight - anchorPoint.y
  const flipAbove = spaceBelow < POPOVER_HEIGHT_ESTIMATE + GAP

  return flipAbove
    ? { bottom: window.innerHeight - anchorPoint.y + GAP, left }
    : { top: anchorPoint.y + GAP, left }
}

/** A single-purpose color-swatch dropdown (no rotate/fixed mode, unlike the toolbar's ColorModePicker). */
function ColorPickerControl({ color, onChange }) {
  const { open, setOpen, toggle, wrapperRef } = useDropdown()

  return (
    <div className="popover-picker" ref={wrapperRef}>
      <button
        type="button"
        className="popover-picker-trigger"
        onClick={toggle}
        title="Color"
        aria-label="Color"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="color-mode-swatch color-mode-swatch--sm" style={{ backgroundColor: color }} />
      </button>
      {open && (
        <div className="color-mode-dropdown" role="menu">
          <div className="color-mode-swatches" role="radiogroup" aria-label="Annotation color">
            {ANNOTATION_COLORS.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                role="radio"
                aria-checked={color === swatch.hex}
                className={`color-swatch${color === swatch.hex ? ' color-swatch--active' : ''}`}
                style={{ backgroundColor: swatch.hex }}
                title={swatch.id}
                onClick={() => { onChange(swatch.hex); setOpen(false) }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Trigger button + dropdown panel of labeled icon options, shared by the
 * arrow-style/width/dash pickers (three occurrences of identical markup,
 * past the rule-of-three threshold). The color picker keeps its own layout
 * instead of using this - an unlabeled swatch grid, not a labeled radio list.
 */
function OptionDropdown({ triggerIcon, triggerLabel, options }) {
  const { open, setOpen, toggle, wrapperRef } = useDropdown()

  return (
    <div className="popover-picker" ref={wrapperRef}>
      <button
        type="button"
        className="popover-picker-trigger"
        onClick={toggle}
        title={triggerLabel}
        aria-label={triggerLabel}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {triggerIcon}
      </button>
      {open && (
        <div className="color-mode-dropdown" role="menu">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitemradio"
              aria-checked={option.active}
              className={`color-mode-option${option.active ? ' color-mode-option--active' : ''}`}
              onClick={() => { option.onSelect(); setOpen(false) }}
            >
              <span className="popover-picker-option-icon">{option.icon}</span>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Dropdown for an arrow's end style (arrowhead / dimension ticks / no head / double-headed). */
function ArrowStylePickerControl({ arrowStyle, onChange }) {
  const current = ARROW_STYLES.find((s) => s.id === arrowStyle) || ARROW_STYLES[0]

  return (
    <OptionDropdown
      triggerIcon={ARROW_STYLE_ICONS[current.id]}
      triggerLabel={`Arrow style: ${current.label}`}
      options={ARROW_STYLES.map((style) => ({
        key: style.id,
        label: style.label,
        icon: ARROW_STYLE_ICONS[style.id],
        active: arrowStyle === style.id,
        onSelect: () => onChange(style.id)
      }))}
    />
  )
}

/** A short line preview at the given width/dash, used by the width and dash pickers' option rows, and by the dash picker's own trigger. */
function LinePreviewIcon({ width, dash }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  )
}

/**
 * Fixed "line weight" pictogram (three bars of increasing thickness) for the
 * width picker's own trigger button. A single reactive-width line there
 * looked nearly identical to the dash picker's trigger at the common
 * "medium/solid" state - three bars reads unambiguously as "thickness"
 * regardless of the currently selected width.
 */
function ThicknessIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="2" y1="12.5" x2="14" y2="12.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/** Dropdown for stroke width, presets and label depending on annotation type ("Stripe size" for a highlighter, "Line width" otherwise). */
function WidthPickerControl({ type, strokeWidth, onChange }) {
  const presets = presetsFor(type)
  const current = presets.find((p) => p.value === strokeWidth) || presets[1]
  const label = type === 'highlighter' ? 'Stripe size' : 'Line width'
  // Presets range from 2 to 26; capped so the option icons stay legible at 16x16.
  const previewWidth = (value) => Math.max(1, Math.min(8, value / 3))

  return (
    <OptionDropdown
      triggerIcon={<ThicknessIcon />}
      triggerLabel={`${label}: ${current.label}`}
      options={presets.map((preset) => ({
        key: preset.id,
        label: preset.label,
        icon: <LinePreviewIcon width={previewWidth(preset.value)} />,
        active: strokeWidth === preset.value,
        onSelect: () => onChange(preset.value)
      }))}
    />
  )
}

/** Dropdown for line style (solid / dashed / dotted). */
function DashPickerControl({ dashStyle, onChange }) {
  const value = dashStyle || 'solid'
  const current = DASH_STYLES.find((d) => d.id === value) || DASH_STYLES[0]

  return (
    <OptionDropdown
      triggerIcon={<LinePreviewIcon width={2} dash={DASH_ICON_PATTERN[value]} />}
      triggerLabel={`Line style: ${current.label}`}
      options={DASH_STYLES.map((style) => ({
        key: style.id,
        label: style.label,
        icon: <LinePreviewIcon width={2} dash={DASH_ICON_PATTERN[style.id]} />,
        active: value === style.id,
        onSelect: () => onChange(style.id)
      }))}
    />
  )
}

/**
 * The row of style-picker dropdowns, gated per annotation type by
 * STYLE_FIELDS. On a recording it also names the moment or span the
 * annotation is pinned to.
 */
function PopoverControls({
  annotationType, color, onColorChange, arrowStyle, onArrowStyleChange,
  strokeWidth, onStrokeWidthChange, dashStyle, onDashStyleChange, timeBadge, onVoiceText
}) {
  const fields = STYLE_FIELDS[annotationType] || []
  return (
    <div className="popover-controls">
      <ColorPickerControl color={color} onChange={onColorChange} />
      {fields.includes('arrowStyle') && <ArrowStylePickerControl arrowStyle={arrowStyle} onChange={onArrowStyleChange} />}
      {fields.includes('strokeWidth') && (
        <WidthPickerControl type={annotationType} strokeWidth={strokeWidth} onChange={onStrokeWidthChange} />
      )}
      {fields.includes('dashStyle') && <DashPickerControl dashStyle={dashStyle} onChange={onDashStyleChange} />}
      {onVoiceText && <VoiceNoteButton onText={onVoiceText} />}
      {timeBadge && <span className="comment-popover-time">{timeBadge}</span>}
    </div>
  )
}

/** The hint text plus Cancel/Add(Save) buttons. */
function PopoverFooter({ isEditing, onCancel, onSubmit }) {
  return (
    <div className="comment-popover-footer">
      <span className="comment-popover-hint">
        {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to save
      </span>
      <div className="comment-popover-actions">
        <button type="button" className="comment-popover-cancel-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="comment-popover-submit-btn" onClick={onSubmit}>
          {isEditing ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  )
}

/**
 * A small in-page comment box anchored near an annotation (either one just
 * drawn, or an existing one being edited), so the human never leaves the
 * annotator UI to type a comment (no window.prompt) or pick a color.
 */
export default function CommentPopover({
  anchorPoint, initialText = '', initialColor, annotationType, initialArrowStyle,
  initialStrokeWidth, initialDashStyle, isEditing = false, timeBadge = null, voiceNotes = false, elementHint = null,
  onSubmit, onClose
}) {
  const [text, setText] = useState(initialText)
  const [color, setColor] = useState(initialColor || ANNOTATION_COLORS[0].hex)
  const [arrowStyle, setArrowStyle] = useState(resolveArrowStyle(initialArrowStyle))
  const [strokeWidth, setStrokeWidth] = useState(
    strokeWidthOf({ type: annotationType, strokeWidth: initialStrokeWidth })
  )
  const [dashStyle, setDashStyle] = useState(initialDashStyle || 'solid')
  const textareaRef = useRef(null)
  const popoverRef = useRef(null)
  const position = computePosition(anchorPoint)

  useEffect(() => {
    const id = setTimeout(() => textareaRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [])

  // A click anywhere outside the popover (including on the canvas) discards
  // it, exactly like Escape and Cancel - never auto-saves. Clicks inside an
  // open dropdown panel are still "inside" here, since those panels render
  // as normal children of this root rather than being portaled elsewhere.
  useOutsideClick(popoverRef, onClose)

  // A transcript is appended rather than replacing what was typed, and the
  // field gets focus back so it can be corrected right away.
  const appendVoiceText = useCallback((spoken) => {
    setText((current) => (current.trim() ? `${current.trimEnd()} ${spoken}` : spoken))
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(() => {
    onSubmit({ text: text.trim(), color, arrowStyle, strokeWidth, dashStyle })
  }, [text, color, arrowStyle, strokeWidth, dashStyle, onSubmit])

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return createPortal(
    <div
      ref={popoverRef}
      className="comment-popover"
      style={{ ...position, width: POPOVER_WIDTH }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <PopoverControls
        annotationType={annotationType}
        color={color} onColorChange={setColor}
        arrowStyle={arrowStyle} onArrowStyleChange={setArrowStyle}
        strokeWidth={strokeWidth} onStrokeWidthChange={setStrokeWidth}
        dashStyle={dashStyle} onDashStyleChange={setDashStyle}
        timeBadge={timeBadge}
        onVoiceText={voiceNotes ? appendVoiceText : null}
      />
      {elementHint && (
        <p className="comment-popover-element" title={elementHint}>
          {annotationType === 'text' ? TOOL_ICONS.text : TOOL_ICONS.element}
          <span className="visually-hidden">{annotationType === 'text' ? 'Selected text: ' : 'Element: '}</span>
          <span className="comment-popover-element-name">{elementHint}</span>
        </p>
      )}
      <div className="comment-popover-body">
        <textarea
          ref={textareaRef}
          className="comment-popover-textarea"
          placeholder="Add a comment (optional)..."
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <PopoverFooter isEditing={isEditing} onCancel={onClose} onSubmit={handleSubmit} />
    </div>,
    document.body
  )
}
