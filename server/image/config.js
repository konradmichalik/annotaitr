/**
 * Image-mode-only configuration. Shared settings (port, host, browser,
 * heartbeat, ...) live in server/core/config.js.
 */

import { readEnvWithFallback } from '../core/config.js'

const DEFAULT_CAPTURE_TIMEOUT_MS = 15_000

// width x height, in CSS pixels: matched against page.setViewportSize()
export const VIEWPORT_PRESETS = {
  desktop: { width: 1920, height: 1080 },
  laptop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 }
}

/**
 * Resolve a viewport argument: a known preset name (case-insensitive), or an
 * explicit "WxH" size. Returns { width, height }, defaults to desktop when
 * `spec` is null/empty, or null when `spec` matches neither shape.
 */
export function parseViewportSpec(spec) {
  if (!spec) { return VIEWPORT_PRESETS.desktop }
  const trimmed = spec.trim().toLowerCase()
  if (VIEWPORT_PRESETS[trimmed]) { return VIEWPORT_PRESETS[trimmed] }

  const customMatch = trimmed.match(/^(\d+)x(\d+)$/)
  if (customMatch) {
    const width = parseInt(customMatch[1], 10)
    const height = parseInt(customMatch[2], 10)
    if (width > 0 && height > 0) { return { width, height } }
  }

  return null
}

export const MAX_DELAY_MS = 10_000
// A recapture is requested over HTTP, so its viewport is bounded on both
// ends: tiny ones render nothing useful, huge ones only cost memory.
const MIN_VIEWPORT_SIDE = 200
const MAX_VIEWPORT_SIDE = 4000
const MAX_SCROLL_Y = 20000
const ANCHOR = /^#[A-Za-z][\w-]{0,99}$/

/** Milliseconds to wait after load before capturing, or null when `value` is not a whole number from 0 to MAX_DELAY_MS. */
export function parseDelay(value) {
  if (value === null || value === undefined || value === '') { return null }
  const delay = Number(value)
  return Number.isInteger(delay) && delay >= 0 && delay <= MAX_DELAY_MS ? delay : null
}

function parseRecaptureViewport(spec) {
  const viewport = typeof spec === 'string' ? parseViewportSpec(spec) : null
  const inRange = (side) => side >= MIN_VIEWPORT_SIDE && side <= MAX_VIEWPORT_SIDE
  return viewport && inRange(viewport.width) && inRange(viewport.height) ? viewport : null
}

/** A section is an anchor to scroll to or a scroll position; null captures the full page. */
function parseSection(section) {
  if (section === null || section === undefined) { return { section: null } }
  if (typeof section !== 'object') { return null }
  const keys = Object.keys(section)
  if (keys.length !== 1) { return null }
  if (keys[0] === 'anchor' && typeof section.anchor === 'string' && ANCHOR.test(section.anchor)) {
    return { section: { anchor: section.anchor } }
  }
  const { scrollY } = section
  if (keys[0] === 'scrollY' && Number.isInteger(scrollY) && scrollY >= 0 && scrollY <= MAX_SCROLL_Y) {
    return { section: { scrollY } }
  }
  return null
}

/** Validate a recapture request body into { settings } or { error }. */
export function parseCaptureSettings(body) {
  if (!body || typeof body !== 'object') { return { error: 'Expected a JSON object' } }
  const viewport = parseRecaptureViewport(body.viewport)
  if (!viewport) {
    return { error: `Unknown viewport. Use desktop, laptop, tablet, mobile, or WxH from ${MIN_VIEWPORT_SIDE} to ${MAX_VIEWPORT_SIDE}.` }
  }
  const delayMs = body.delayMs === undefined ? 0 : parseDelay(body.delayMs)
  if (delayMs === null) { return { error: `Delay must be a whole number of milliseconds from 0 to ${MAX_DELAY_MS}.` } }
  const parsed = parseSection(body.section)
  if (!parsed) { return { error: 'Section must be an #anchor or a whole scroll position in px.' } }
  return { settings: { viewport, delayMs, section: parsed.section } }
}

// Only these have a landscape layout worth reviewing; a desktop on its side
// is just a custom size.
const ROTATABLE_PRESETS = ['tablet', 'mobile']

function presetName({ width, height }) {
  const upright = Object.keys(VIEWPORT_PRESETS).find((name) => {
    const preset = VIEWPORT_PRESETS[name]
    return preset.width === width && preset.height === height
  })
  if (upright) { return upright }
  const turned = ROTATABLE_PRESETS.find((name) => {
    const preset = VIEWPORT_PRESETS[name]
    return preset.width === height && preset.height === width
  })
  return turned ? `${turned} landscape` : undefined
}

/** How a URL was captured, in words, e.g. "tablet (768×1024), section #pricing, after 500 ms". */
export function describeCapture({ viewport, delayMs, section }) {
  const size = `${viewport.width}×${viewport.height}`
  const name = presetName(viewport)
  const parts = [name ? `${name} (${size})` : size]
  if (!section) { parts.push('full page') }
  else if (section.anchor) { parts.push(`section ${section.anchor}`) }
  else if (section.scrollY === 0) { parts.push('first screen only') }
  else { parts.push(`section from ${section.scrollY} px down`) }
  if (delayMs > 0) { parts.push(`after ${delayMs} ms`) }
  return parts.join(', ')
}

function getCaptureTimeoutMs() {
  const envTimeout = readEnvWithFallback('ANNOTAITR_CAPTURE_TIMEOUT')
  if (envTimeout) {
    const parsed = parseInt(envTimeout, 10)
    if (!isNaN(parsed) && parsed >= 1000 && parsed <= 120_000) {
      return parsed
    }
  }
  return DEFAULT_CAPTURE_TIMEOUT_MS
}

export const config = {
  captureTimeoutMs: getCaptureTimeoutMs(),
  maxImageBytes: 15 * 1024 * 1024,
  maxImageDimension: 20000,
  // A video is streamed from disk and never held in memory, so its cap only
  // guards against an accidental target. A GIF is decoded whole in the
  // browser, which is why its cap is far lower.
  maxVideoBytes: 500 * 1024 * 1024,
  // 8K. A frame PNG declares its size in a few bytes but decodes to
  // width x height x 4, and the overview holds a dozen of them.
  maxVideoDimension: 8192,
  maxGifBytes: 50 * 1024 * 1024,
  // The render worker reads a PDF into memory whole.
  maxPdfBytes: 200 * 1024 * 1024
}
