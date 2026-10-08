import { useState, useId, useRef, useEffect } from 'react'
import { useDropdown } from '../../../shared/hooks/useDropdown.js'
import { VIEWPORT_ICONS, SECTION_ICONS, CAPTURE_ICONS } from '../utils/icons.jsx'
import {
  PRESET_LABELS, ROTATABLE_PRESETS, captureParts, formLabel, formFromCapture, presetSize, requestFromForm
} from '../utils/captureSettings.js'

const SECTIONS = [
  { id: 'full', label: 'Full page', title: 'Capture the whole page, top to bottom' },
  { id: 'top', label: 'First screen', title: 'Capture only the visible viewport at the top of the page' },
  { id: 'anchor', label: 'Anchor', title: 'Capture the visible viewport, scrolled to an element id such as #pricing' },
  { id: 'scrollY', label: 'Position', title: 'Capture the visible viewport, scrolled this many pixels down' }
]
const DELAYS = [{ ms: '0', label: 'None' }, { ms: '500', label: '0.5 s' }, { ms: '1000', label: '1 s' }, { ms: '2000', label: '2 s' }]

/** A radio styled as a tile: the input stays real and focusable, only visually hidden. */
function ChoiceTile({ name, checked, onSelect, icon, label, title, className }) {
  return (
    <label className={`${className}${checked ? ` ${className}--active` : ''}`} title={title}>
      <input type="radio" className="visually-hidden" name={name} checked={checked} onChange={onSelect} />
      {icon}
      <span>{label}</span>
    </label>
  )
}

function SizeInput({ id, label, value, onChange }) {
  return (
    <label className="viewport-input" htmlFor={id}>
      <span className="visually-hidden">{label}</span>
      <input id={id} type="number" inputMode="numeric" min={200} max={4000} step="1" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

/** The chosen preset's size, with a toggle to turn a tablet or phone into landscape. */
function PresetSize({ form, update, presets }) {
  const { width, height } = presetSize(form.preset, form.rotated, presets)
  const rotatable = ROTATABLE_PRESETS.has(form.preset)
  return (
    <div className="viewport-readout">
      <span>{width} × {height} px</span>
      {rotatable && (
        <button
          type="button" className="viewport-rotate" aria-pressed={form.rotated} onClick={() => update({ rotated: !form.rotated })}
          title={form.rotated ? 'Turn back to portrait' : 'Turn to landscape'}
        >
          {CAPTURE_ICONS.rotate}
          Landscape
        </button>
      )}
    </div>
  )
}

function ViewportFields({ form, update, presets, idPrefix }) {
  return (
    <fieldset className="viewport-group">
      <legend>Viewport</legend>
      <div className="viewport-tiles">
        {[...Object.keys(PRESET_LABELS), 'custom'].map((preset) => (
          <ChoiceTile
            key={preset} name={`${idPrefix}-preset`} className="viewport-tile" checked={form.preset === preset}
            onSelect={() => update({ preset, rotated: false })} label={PRESET_LABELS[preset] ?? 'Custom'}
            icon={<span className={form.preset === preset && form.rotated ? 'viewport-icon--rotated' : undefined}>{VIEWPORT_ICONS[preset]}</span>}
            title={presets[preset] ? `${presets[preset].width} × ${presets[preset].height} px` : 'Your own width and height'}
          />
        ))}
      </div>
      {form.preset !== 'custom' ? (
        <PresetSize form={form} update={update} presets={presets} />
      ) : (
        <div className="viewport-size">
          <SizeInput id={`${idPrefix}-width`} label="Width" value={form.width} onChange={(width) => update({ width })} />
          <span aria-hidden="true">×</span>
          <SizeInput id={`${idPrefix}-height`} label="Height" value={form.height} onChange={(height) => update({ height })} />
          <span className="viewport-unit">px</span>
        </div>
      )}
    </fieldset>
  )
}

function SectionFields({ form, update, idPrefix }) {
  return (
    <fieldset className="viewport-group">
      <legend>Section</legend>
      <div className="viewport-segments">
        {SECTIONS.map(({ id, label, title }) => (
          <ChoiceTile
            key={id} name={`${idPrefix}-section`} className="viewport-segment" checked={form.section === id}
            onSelect={() => update({ section: id })} icon={SECTION_ICONS[id]} label={label} title={title}
          />
        ))}
      </div>
      {form.section === 'anchor' && (
        <label className="viewport-input viewport-input--adorned" htmlFor={`${idPrefix}-anchor`}>
          <span className="viewport-unit" aria-hidden="true">#</span>
          <input id={`${idPrefix}-anchor`} type="text" aria-label="Anchor id" placeholder="pricing" value={form.anchor.replace(/^#/, '')} onChange={(event) => update({ anchor: event.target.value })} />
        </label>
      )}
      {form.section === 'scrollY' && (
        <label className="viewport-input viewport-input--adorned" htmlFor={`${idPrefix}-scroll`}>
          <input id={`${idPrefix}-scroll`} type="number" inputMode="numeric" min={0} max={20000} step="1" aria-label="Scrolled down" placeholder="1200" value={form.scrollY} onChange={(event) => update({ scrollY: event.target.value })} />
          <span className="viewport-unit" aria-hidden="true">px</span>
        </label>
      )}
    </fieldset>
  )
}

function DelayFields({ form, update, idPrefix }) {
  return (
    <fieldset className="viewport-group">
      <legend>Delay after load</legend>
      <div className="viewport-delay">
        <label className="viewport-input viewport-input--adorned" htmlFor={`${idPrefix}-delay`}>
          {CAPTURE_ICONS.delay}
          <input id={`${idPrefix}-delay`} type="number" inputMode="numeric" min={0} max={10000} step="100" aria-label="Delay in milliseconds" value={form.delayMs} onChange={(event) => update({ delayMs: event.target.value })} />
          <span className="viewport-unit" aria-hidden="true">ms</span>
        </label>
        {DELAYS.map(({ ms, label }) => (
          <button key={ms} type="button" className="viewport-chip" aria-pressed={form.delayMs === ms} onClick={() => update({ delayMs: ms })}>
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Puts focus on the chosen viewport when the panel opens, and back on the trigger when it closes. */
function usePanelFocus(open, panelRef, triggerRef) {
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) { panelRef.current?.querySelector('input:checked')?.focus() }
    if (!open && wasOpen.current) { triggerRef.current?.focus() }
    wasOpen.current = open
  }, [open, panelRef, triggerRef])
}

/**
 * The capture control at the top left: one button naming the viewport
 * (`Desktop · 1440`) that opens viewport, section and delay, and an icon
 * button that captures the page again as it is set.
 * `onApply(request, label)` captures the page again and resolves to an
 * error message, or null once the new screenshot is in.
 */
export default function ViewportControl({ capture, busy, annotationCount, onApply }) {
  const { open, setOpen, toggle, wrapperRef } = useDropdown()
  const [form, setForm] = useState(() => formFromCapture(capture))
  const [error, setError] = useState(null)
  const panelRef = useRef(null)
  const triggerRef = useRef(null)
  const idPrefix = useId()
  const current = captureParts(capture)
  const update = (fields) => setForm((state) => ({ ...state, ...fields }))
  usePanelFocus(open, panelRef, triggerRef)

  const openPanel = () => {
    if (!open) { setForm(formFromCapture(capture)); setError(null) }
    toggle()
  }
  const handleSubmit = async (event) => {
    event.preventDefault()
    const message = await onApply(requestFromForm(form, capture.presets), formLabel(form, capture.presets))
    setError(message)
    if (!message) { setOpen(false) }
  }

  // Again with the settings it was captured with, without opening the panel.
  const captureAgain = async () => {
    const settings = formFromCapture(capture)
    setError(await onApply(requestFromForm(settings, capture.presets), formLabel(settings, capture.presets)))
  }

  return (
    <div className="viewport-control" ref={wrapperRef}>
      <div className="viewport-bar">
        <button
          ref={triggerRef} type="button" className="viewport-trigger" onClick={openPanel} disabled={busy}
          aria-haspopup="dialog" aria-expanded={open} aria-label={`Capture settings: ${current.label} ${current.size}`}
          title={`Captured at ${capture.description}`}
        >
          <span className={current.rotated ? 'viewport-icon--rotated' : undefined}>{VIEWPORT_ICONS[current.preset]}</span>
          <span>{current.label} · {capture.viewport.width}</span>
          {CAPTURE_ICONS.chevron}
        </button>
        <button
          type="button" className="viewport-again" onClick={captureAgain} disabled={busy}
          aria-label="Capture again" title={`Capture again (${current.label} ${current.size})`}
        >
          {CAPTURE_ICONS.capture}
        </button>
      </div>
      {error && !open && <p className="viewport-error viewport-error--bar" role="alert">{error}</p>}
      {open && (
        <form ref={panelRef} className="viewport-panel" role="dialog" aria-label="Capture settings" onSubmit={handleSubmit}>
          <ViewportFields form={form} update={update} presets={capture.presets} idPrefix={idPrefix} />
          <SectionFields form={form} update={update} idPrefix={idPrefix} />
          <DelayFields form={form} update={update} idPrefix={idPrefix} />
          {annotationCount > 0 && (
            <p className="viewport-warning">
              {CAPTURE_ICONS.warning}
              Discards {annotationCount === 1 ? 'your annotation' : `${annotationCount} annotations`}
            </p>
          )}
          {error && <p className="viewport-error" role="alert">{error}</p>}
          <div className="viewport-actions">
            <button type="button" className="viewport-cancel" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="viewport-submit" disabled={busy}>
              {CAPTURE_ICONS.capture}
              Capture
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
