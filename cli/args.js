import { resolve as resolvePath } from 'node:path'
import { readFileSync } from 'node:fs'
import { readEnvWithFallback } from '../server/core/config.js'
import { parsePageRanges } from '../server/image/document/pages.js'

const VALID_ORIGINS = ['cli', 'claude-code', 'opencode', 'vibe']
export const VALID_MODES = ['image', 'markdown']

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

export function parseArgs(argv) {
  const args = argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    return { help: true }
  }

  let origin = 'cli'
  let viewportSpec = null
  let delaySpec = null
  let feedbackNotes = null
  let modeOverride = null
  let viewportFlagGiven = false
  let feedbackNotesFlagGiven = false
  let sourceSpec = null
  let pageRanges = null
  const targets = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--origin') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) {
        return { error: '--origin requires a value (cli, claude-code, opencode, vibe)' }
      }
      origin = args[++i]
    } else if (arg === '--as') {
      if (!args[i + 1] || !VALID_MODES.includes(args[i + 1])) {
        return { error: `--as requires a value (${VALID_MODES.join(', ')})` }
      }
      modeOverride = args[++i]
    } else if (arg === '--viewport') {
      if (!args[i + 1]) {
        return { error: '--viewport requires a preset (desktop, laptop, tablet, mobile) or WxH' }
      }
      viewportSpec = args[++i]
      viewportFlagGiven = true
    } else if (arg === '--delay') {
      if (!args[i + 1]) {
        return { error: '--delay requires a number of milliseconds' }
      }
      delaySpec = args[++i]
    } else if (arg === '--feedback-notes') {
      if (!args[i + 1]) {
        return { error: '--feedback-notes requires a JSON string or file path' }
      }
      const value = args[++i]
      try {
        feedbackNotes = parseFeedbackNotes(value)
      } catch (err) {
        return { error: `--feedback-notes: ${err.message}` }
      }
      feedbackNotesFlagGiven = true
    } else if (arg === '--source') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) {
        return { error: '--source requires the path of the file the PDF was rendered from' }
      }
      sourceSpec = args[++i]
    } else if (arg === '--pages') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) {
        return { error: '--pages requires a page range, e.g. 1-5,8,12-' }
      }
      const parsed = parsePageRanges(args[++i])
      if (parsed.error) { return { error: parsed.error } }
      pageRanges = parsed.ranges
    } else if (!arg.startsWith('-')) {
      targets.push(arg)
    } else {
      return { error: `Unknown option: ${arg}` }
    }
  }

  if (!VALID_ORIGINS.includes(origin)) {
    return { error: `Unknown origin "${origin}". Valid: ${VALID_ORIGINS.join(', ')}` }
  }

  if (!feedbackNotes) {
    const envNotes = readEnvWithFallback('ANNOTAITR_FEEDBACK_NOTES', ['MD_ANNOTATOR_FEEDBACK_NOTES'])
    if (envNotes) {
      try {
        feedbackNotes = parseFeedbackNotes(envNotes)
      } catch (err) {
        return { error: `ANNOTAITR_FEEDBACK_NOTES: ${err.message}` }
      }
    }
  }

  return {
    targets, origin, viewportSpec, delaySpec, feedbackNotes, modeOverride, viewportFlagGiven, feedbackNotesFlagGiven,
    sourceSpec, pageRanges
  }
}
