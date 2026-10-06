import { resolve as resolvePath } from 'node:path'
import { readFileSync } from 'node:fs'
import { readEnvWithFallback } from '../server/core/config.js'
import { parsePageRanges } from '../server/image/document/pages.js'
import { isSessionId } from '../server/core/session/identity.js'

const VALID_ORIGINS = ['cli', 'claude-code', 'opencode', 'vibe']
export const VALID_MODES = ['image', 'markdown']
const AS_ERROR = `--as requires a value (${VALID_MODES.join(', ')})`

function parseFeedbackNotes(value) {
  const trimmed = value.trim()
  let parsed
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    parsed = JSON.parse(trimmed)
  } else {
    // Treat as file path
    const content = readFileSync(resolvePath(value), 'utf-8')
    parsed = JSON.parse(content)
  }
  if (!Array.isArray(parsed) && (typeof parsed !== 'object' || parsed === null)) {
    throw new Error('Expected a JSON array or object')
  }
  return parsed
}

/**
 * Every option that takes a value. `missing` is the error for an absent
 * value, or for one that is itself a flag when `noFlagValue` is set. `parse`
 * turns the raw value into `{ value }` or `{ error }`.
 */
const VALUE_OPTIONS = {
  '--origin': { key: 'origin', noFlagValue: true, missing: '--origin requires a value (cli, claude-code, opencode, vibe)' },
  '--as': {
    key: 'modeOverride',
    missing: AS_ERROR,
    parse: (value) => (VALID_MODES.includes(value) ? { value } : { error: AS_ERROR })
  },
  '--viewport': { key: 'viewportSpec', noFlagValue: true, missing: '--viewport requires a preset (desktop, laptop, tablet, mobile) or WxH' },
  '--delay': { key: 'delaySpec', noFlagValue: true, missing: '--delay requires a number of milliseconds' },
  '--feedback-notes': {
    key: 'feedbackNotes',
    missing: '--feedback-notes requires a JSON string or file path',
    parse: (value) => {
      try {
        return { value: parseFeedbackNotes(value) }
      } catch (err) {
        return { error: `--feedback-notes: ${err.message}` }
      }
    }
  },
  '--source': { key: 'sourceSpec', noFlagValue: true, missing: '--source requires the path of the file the PDF was rendered from' },
  '--pages': {
    key: 'pageRanges',
    noFlagValue: true,
    missing: '--pages requires a page range, e.g. 1-5,8,12-',
    parse: (value) => {
      const parsed = parsePageRanges(value)
      return parsed.error ? { error: parsed.error } : { value: parsed.ranges }
    }
  },
  '--session': {
    key: 'sessionId',
    noFlagValue: true,
    missing: '--session requires the session id printed after "Session:"',
    parse: (value) => (isSessionId(value)
      ? { value }
      : { error: `--session expects the 12-character id printed after "Session:", got "${value}"` })
  }
}

const FLAG_OPTIONS = { '--new-session': 'newSession' }

function parseOptions(args) {
  const options = {}
  const targets = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (FLAG_OPTIONS[arg]) {
      options[FLAG_OPTIONS[arg]] = true
      continue
    }
    const option = VALUE_OPTIONS[arg]
    if (!option) {
      if (arg.startsWith('-')) { return { error: `Unknown option: ${arg}` } }
      targets.push(arg)
      continue
    }
    const raw = args[i + 1]
    if (!raw || (option.noFlagValue && raw.startsWith('-'))) { return { error: option.missing } }
    i++
    const { value, error } = option.parse ? option.parse(raw) : { value: raw }
    if (error) { return { error } }
    options[option.key] = value
  }
  return { options, targets }
}

function feedbackNotesFromEnv() {
  const envNotes = readEnvWithFallback('ANNOTAITR_FEEDBACK_NOTES', ['MD_ANNOTATOR_FEEDBACK_NOTES'])
  if (!envNotes) { return { value: null } }
  try {
    return { value: parseFeedbackNotes(envNotes) }
  } catch (err) {
    return { error: `ANNOTAITR_FEEDBACK_NOTES: ${err.message}` }
  }
}

export function parseArgs(argv) {
  const args = argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    return { help: true }
  }

  const { options, targets, error } = parseOptions(args)
  if (error) { return { error } }

  const origin = options.origin ?? 'cli'
  if (!VALID_ORIGINS.includes(origin)) {
    return { error: `Unknown origin "${origin}". Valid: ${VALID_ORIGINS.join(', ')}` }
  }

  const feedbackNotesFlagGiven = options.feedbackNotes !== undefined
  const notes = feedbackNotesFlagGiven ? { value: options.feedbackNotes } : feedbackNotesFromEnv()
  if (notes.error) { return { error: notes.error } }

  if (options.sessionId && options.newSession) {
    return { error: '--session and --new-session cannot be combined' }
  }

  return {
    targets,
    origin,
    viewportSpec: options.viewportSpec ?? null,
    delaySpec: options.delaySpec ?? null,
    feedbackNotes: notes.value,
    modeOverride: options.modeOverride ?? null,
    feedbackNotesFlagGiven,
    sourceSpec: options.sourceSpec ?? null,
    pageRanges: options.pageRanges ?? null,
    sessionId: options.sessionId ?? null,
    newSession: options.newSession === true
  }
}

/** The error for --viewport or --delay on a target that is not a URL, or null. */
export function captureFlagError(kind, { viewportSpec, delaySpec }) {
  if (viewportSpec) { return `--viewport only applies to a URL target, not ${kind}.` }
  if (delaySpec !== null) { return `--delay only applies to a URL target, not ${kind}.` }
  return null
}
