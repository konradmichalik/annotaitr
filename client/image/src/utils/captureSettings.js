/**
 * Conversions between a captured URL's settings (viewport, section, delay),
 * as /api/meta reports them, and the viewport picker's form. The preset
 * sizes come from the server along with the settings.
 */

export const PRESET_LABELS = { desktop: 'Desktop', laptop: 'Laptop', tablet: 'Tablet', mobile: 'Phone' }
// Mirrors ROTATABLE_PRESETS in server/image/common/config.js.
export const ROTATABLE_PRESETS = new Set(['tablet', 'mobile'])

const matches = (preset, width, height) => preset?.width === width && preset?.height === height

/** The preset a viewport is, upright or (tablet and phone only) turned on its side. */
function presetOf({ width, height }, presets) {
  const upright = Object.keys(PRESET_LABELS).find((name) => matches(presets[name], width, height))
  if (upright) { return { preset: upright, rotated: false } }
  const turned = [...ROTATABLE_PRESETS].find((name) => matches(presets[name], height, width))
  return turned ? { preset: turned, rotated: true } : { preset: 'custom', rotated: false }
}

function presetLabel(preset, rotated) {
  return `${PRESET_LABELS[preset] ?? 'Custom'}${rotated ? ' landscape' : ''}`
}

/** The size a preset captures at, swapped when it is turned. */
export function presetSize(preset, rotated, presets) {
  const { width, height } = presets[preset]
  return rotated ? { width: height, height: width } : { width, height }
}

/** The preset a capture used (or "custom"), its display label and its size. */
export function captureParts({ viewport, presets }) {
  const { preset, rotated } = presetOf(viewport, presets)
  return { preset, rotated, label: presetLabel(preset, rotated), size: `${viewport.width}×${viewport.height}` }
}

/** What a form will capture, e.g. "Tablet landscape 1024×768" or "Custom 1000×700". */
export function formLabel({ preset, rotated, width, height }, presets) {
  if (preset === 'custom') { return `Custom ${width}×${height}` }
  const size = presetSize(preset, rotated, presets)
  return `${presetLabel(preset, rotated)} ${size.width}×${size.height}`
}

// "top" is the first screen: a section scrolled nowhere.
function sectionKind(section) {
  if (!section) { return 'full' }
  if (section.anchor) { return 'anchor' }
  return section.scrollY === 0 ? 'top' : 'scrollY'
}

/** Form fields are strings, as the inputs hold them. */
export function formFromCapture({ viewport, delayMs, section, presets }) {
  const { preset, rotated } = presetOf(viewport, presets)
  return {
    preset,
    rotated,
    width: String(viewport.width),
    height: String(viewport.height),
    delayMs: String(delayMs),
    section: sectionKind(section),
    anchor: section?.anchor ?? '',
    scrollY: section?.scrollY === undefined ? '' : String(section.scrollY)
  }
}

function sectionFromForm({ section, anchor, scrollY }) {
  if (section === 'anchor') {
    const trimmed = anchor.trim()
    return { anchor: trimmed.startsWith('#') ? trimmed : `#${trimmed}` }
  }
  if (section === 'top') { return { scrollY: 0 } }
  if (section === 'scrollY') { return { scrollY: Number(scrollY) } }
  return null
}

function viewportFromForm(form, presets) {
  if (form.preset === 'custom') { return `${form.width}x${form.height}` }
  if (!form.rotated) { return form.preset }
  const { width, height } = presetSize(form.preset, true, presets)
  return `${width}x${height}`
}

/** The /api/recapture body; the server validates every field again. */
export function requestFromForm(form, presets) {
  return {
    viewport: viewportFromForm(form, presets),
    delayMs: form.delayMs === '' ? 0 : Number(form.delayMs),
    section: sectionFromForm(form)
  }
}
