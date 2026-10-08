import { INTENTS } from './intents.js'

/** Settings both modes offer, stored once so a change in one mode carries over to the other. */
export const SHARED_DEFAULTS = {
  theme: 'auto',
  autoCloseDelay: 'off',
  toolHints: true,
  defaultIntent: 'change'
}

const ALLOWED = {
  theme: ['light', 'dark', 'auto'],
  autoCloseDelay: ['off', '0', '3', '5'],
  defaultIntent: INTENTS.map((intent) => intent.id)
}

function parse(raw) {
  if (!raw) { return {} }
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

// Early versions stored the delay as a number or `false`; the dialog only knows the strings.
function normalizeDelay(value) {
  if (value === false || value === null) { return 'off' }
  return typeof value === 'number' ? String(value) : value
}

/**
 * Brings stored settings up to date: `autoSaveDrafts` became `keepDrafts`,
 * the delay is a string, and a value no control offers any more is dropped
 * so its default applies.
 */
export function migrateSettings(stored) {
  const { autoSaveDrafts, ...rest } = stored
  const migrated = { ...rest }
  if (autoSaveDrafts !== undefined && migrated.keepDrafts === undefined) { migrated.keepDrafts = autoSaveDrafts }
  if ('autoCloseDelay' in migrated) { migrated.autoCloseDelay = normalizeDelay(migrated.autoCloseDelay) }
  for (const [key, values] of Object.entries(ALLOWED)) {
    if (key in migrated && !values.includes(migrated[key])) { delete migrated[key] }
  }
  return migrated
}

export function sharedPart(settings) {
  return Object.fromEntries(Object.keys(SHARED_DEFAULTS).map((key) => [key, settings[key]]))
}

/**
 * The settings of one mode: its defaults, then its own cookie, then the
 * shared cookie for the keys both modes share. `legacyAutoClose` is the
 * cookie the very first auto-close version wrote, used only while nothing
 * newer holds a delay.
 */
export function mergeSettings(defaults, modeRaw, sharedRaw, legacyAutoClose = null) {
  const mode = migrateSettings(parse(modeRaw))
  const shared = migrateSettings(parse(sharedRaw))
  const legacy = legacyAutoClose && !('autoCloseDelay' in mode) && !('autoCloseDelay' in shared)
    ? migrateSettings({ autoCloseDelay: legacyAutoClose })
    : {}
  const merged = { ...defaults, ...legacy, ...mode }
  return { ...merged, ...sharedPart({ ...merged, ...shared }) }
}
