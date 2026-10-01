#!/usr/bin/env node

import { resolve as resolvePath } from 'node:path'
import { readFileSync, realpathSync } from 'node:fs'
import { access, constants } from 'node:fs/promises'
import { readEnvWithFallback } from './server/core/config.js'
import { openBrowser } from './server/core/browser.js'
import { withLifecycle } from './server/core/lifecycle.js'
import { isAnnotatableFile, supportedExtensions as markdownExtensions } from './server/markdown/file.js'
import { buildMarkdownServer } from './server/markdown/adapter.js'
import { formatApprovalOutput as formatMarkdownApproval } from './server/markdown/feedback.js'
import { isImageFile, isSupportedCaptureUrl } from './server/image/capture.js'
import { parseViewportSpec } from './server/image/config.js'
import { saveClipboardImage } from './server/image/clipboard.js'

/**
 * Image mode's real work (server/image/loader.js, server/image/adapter.js)
 * pulls in playwright and @napi-rs/canvas — both optionalDependencies. Load
 * them dynamically, only once image mode is confirmed, so a markdown-only
 * install never needs them and a missing install gets an actionable error
 * instead of a crash on an unrelated command.
 */
async function loadImageRuntime() {
  try {
    const [loader, adapter] = await Promise.all([
      import('./server/image/loader.js'),
      import('./server/image/adapter.js')
    ])
    return { loadImageFromFile: loader.loadImageFromFile, captureUrl: loader.captureUrl, buildImageServer: adapter.buildImageServer }
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        'Image mode needs playwright and @napi-rs/canvas, which are optional dependencies. ' +
        'Install them with: npm i playwright @napi-rs/canvas'
      )
    }
    throw error
  }
}

const VALID_ORIGINS = ['cli', 'claude-code', 'opencode', 'vibe']
const VALID_MODES = ['image', 'markdown']

const CHAT_IMAGE_HINT =
  'PASTED CHAT IMAGE: the target is an image pasted or dropped into the chat, not a file path. ' +
  'Find the `[Image: source: <path>]` line for it in the conversation and run annotaitr on that path.\n'

const HELP_TEXT = `
annotaitr — Annotate an image, a captured web page, or Markdown/plain-text
files in the browser

Usage:
  annotaitr [options] [target ...]

Which mode runs is auto-detected from the target:
  - no target                  reads an image from the clipboard (macOS only)
  - one or more existing files, all markdown/plain-text   -> markdown mode
  - a single http(s) URL                                   -> image mode (capture)
  - a single existing image file (.png, .jpg, .jpeg, .webp, .svg) -> image mode

Options:
  --help                       Show this help message
  --origin <name>               Set caller origin (cli, claude-code, opencode, vibe)
  --as <image|markdown>         Skip detection, force a mode
  --viewport <preset|WxH>       Image mode only: desktop (default) | laptop | tablet | mobile | <W>x<H>
  --feedback-notes <json|path>  Markdown mode only: AI notes to display as read-only annotations

Markdown files supported:
  Markdown (.md, .markdown, .mdown, .mkd) renders as formatted markdown.
  Config and data files (.yaml, .yml, .json, .jsonc, .json5, .toml, .ini,
  .cfg, .conf, .properties, .csv, .tsv, .log, .xml, .txt, .text,
  .env.example) render as raw source with line numbers.
  Files above 2 MB are rejected. A real .env file is not supported — it
  commonly holds secrets (.env.example is fine).

Environment:
  ANNOTAITR_PORT            Port or inclusive range, e.g. 3000 or 3000-3010
  ANNOTAITR_HOST             Host to bind to (default: 127.0.0.1)
  ANNOTAITR_BROWSER          Custom browser app name
  ANNOTAITR_TIMEOUT          Heartbeat timeout in ms (default: 30000, range: 5000-300000)
  ANNOTAITR_NO_OPEN          Skip opening a browser tab automatically
  ANNOTAITR_CAPTURE_TIMEOUT  Image mode: page-load timeout in ms for URL capture
  ANNOTAITR_FEEDBACK_NOTES   Markdown mode: JSON string or file path for feedback notes
  (MD_ANNOTATOR_* still works as a deprecated fallback)

Examples:
  annotaitr README.md
  annotaitr docs/api.md docs/guide.md
  annotaitr ./mockup.png
  annotaitr http://localhost:3000
  annotaitr --viewport mobile http://localhost:3000/checkout
  annotaitr ./diagram.svg
  annotaitr                              # read an image from the clipboard (macOS)
`.trim()

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
  let feedbackNotes = null
  let modeOverride = null
  let viewportFlagGiven = false
  let feedbackNotesFlagGiven = false
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

  return { targets, origin, viewportSpec, feedbackNotes, modeOverride, viewportFlagGiven, feedbackNotesFlagGiven }
}

async function fileExists(path) {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Decide which mode to run in, per the detection rules in the merge spec:
 * 0. --as override (handled by the caller before this runs)
 * 1. no target: handled by the caller (clipboard read, macOS only)
 * 2. every target exists and is markdown/plain-text -> markdown (multiple allowed)
 * 3. a single http(s) URL -> image (capture)
 * 4. a single existing file with a supported image extension -> image (local file)
 * 5. anything else -> a detailed error
 */
export async function detectMode(targets) {
  const resolved = targets.map((t) => resolvePath(t))
  const annotatableChecks = await Promise.all(
    resolved.map(async (p) => (await fileExists(p)) && isAnnotatableFile(p))
  )
  if (annotatableChecks.every(Boolean)) {
    return { mode: 'markdown', resolvedPaths: resolved }
  }

  if (targets.length === 1) {
    const [target] = targets
    if (isSupportedCaptureUrl(target)) {
      return { mode: 'image', capture: 'url', target }
    }
    const abs = resolved[0]
    if ((await fileExists(abs)) && isImageFile(abs)) {
      return { mode: 'image', capture: 'file', resolvedPath: abs }
    }
  }

  return { error: buildDetectionError(targets) }
}

function buildDetectionError(targets) {
  if (targets.length > 1) {
    return (
      `Could not determine a single mode for: ${targets.join(', ')}\n` +
      'Multiple targets are only supported for markdown/plain-text files. ' +
      'Pass exactly one target for image mode, or use --as to force a mode.'
    )
  }
  return (
    `Unsupported target: ${targets[0]}\n` +
    `Markdown/plain-text extensions: ${markdownExtensions().join(', ')}\n` +
    'Image extensions: .png, .jpg, .jpeg, .webp, .svg (or a http(s) URL to capture)\n' +
    'Use --as image or --as markdown to force a mode.'
  )
}

async function resolveMarkdownTargets(targets) {
  const absolutePaths = []
  for (const fp of targets) {
    const abs = resolvePath(fp)
    if (!isAnnotatableFile(abs)) {
      return { error: `Unsupported file type: ${fp}\nSupported: ${markdownExtensions().join(', ')}` }
    }
    if (!(await fileExists(abs))) {
      return { error: `File not found: ${abs}` }
    }
    absolutePaths.push(abs)
  }
  return { absolutePaths }
}

async function resolveImageCapture(targets, viewportSpec, { clipboardPath, loadImageFromFile, captureUrl } = {}) {
  if (clipboardPath) {
    return { capture: await loadImageFromFile(clipboardPath), targetLabel: 'clipboard image' }
  }

  const [target] = targets

  if (target && isSupportedCaptureUrl(target)) {
    const viewport = parseViewportSpec(viewportSpec)
    if (!viewport) {
      return { error: `Unknown viewport "${viewportSpec}". Use desktop, laptop, tablet, mobile, or WxH.` }
    }
    process.stderr.write(`Capturing ${target} at ${viewport.width}x${viewport.height}...\n`)
    return { capture: await captureUrl(target, viewport), targetLabel: target }
  }

  if (viewportSpec) {
    return { error: '--viewport only applies to a URL target, not a local image file.' }
  }

  let imagePath
  if (target) {
    imagePath = resolvePath(target)
    if (!(await fileExists(imagePath))) {
      return { error: `File not found or not a URL: ${imagePath}` }
    }
  } else {
    process.stderr.write('No target given, reading image from the clipboard...\n')
    try {
      imagePath = await saveClipboardImage()
    } catch (error) {
      return { error: error.message }
    }
  }

  return { capture: await loadImageFromFile(imagePath), targetLabel: target ?? 'clipboard image' }
}

function fail(message) {
  process.stderr.write(`Error: ${message}\n\n${HELP_TEXT}\n`)
  process.exit(1)
}

function printHelpAndExit(code) {
  process.stderr.write(HELP_TEXT + '\n')
  process.exit(code)
}

async function runMarkdown({ targets, origin, feedbackNotes }) {
  if (targets.length === 0) {
    fail('No file specified.')
    return
  }

  const { absolutePaths, error } = await resolveMarkdownTargets(targets)
  if (error) { fail(error); return }

  const server = withLifecycle(await buildMarkdownServer({ filePaths: absolutePaths, origin, feedbackNotes }))
  const url = `http://localhost:${server.port}`

  process.stderr.write(`Server running at ${url}\n`)
  process.stderr.write(`Annotating: ${absolutePaths.join(', ')}\n`)
  await openBrowser(url)

  const decision = await server.waitForDecision()
  await handleOutcome(server, decision, () => (
    decision.approved
      ? formatMarkdownApproval(decision)
      : decision.feedback + '\n'
  ))
}

async function runImage({ targets, origin, viewportSpec, clipboardPath }) {
  const { loadImageFromFile, captureUrl, buildImageServer } = await loadImageRuntime()
  const { capture, targetLabel, error } = await resolveImageCapture(targets, viewportSpec, { clipboardPath, loadImageFromFile, captureUrl })
  if (error) { fail(error); return }

  const server = withLifecycle(await buildImageServer({
    imageBuffer: capture.buffer,
    imageWidth: capture.width,
    imageHeight: capture.height,
    origin,
    targetLabel
  }))

  process.stderr.write(`Server running at ${server.url}\n`)
  await openBrowser(server.url)

  const decision = await server.waitForDecision()
  await handleOutcome(server, decision, () => decision.output)
}

async function handleOutcome(server, decision, buildOutput) {
  if (decision.aborted) {
    process.stderr.write('Interrupted. No decision made.\n')
    server.shutdown()
    process.exit(1)
    return
  }

  if (decision.disconnected) {
    process.stderr.write('Browser tab closed. No decision made.\n')
    server.shutdown()
    process.exit(1)
    return
  }

  // Give the browser time to receive the response before the server closes
  await new Promise((r) => setTimeout(r, 500))

  process.stderr.write(
    decision.approved
      ? (decision.feedback || decision.annotationCount
        ? `Decision: Approved with ${decision.annotationCount} note(s)\n`
        : 'Decision: Approved (no changes)\n')
      : `Decision: Feedback with ${decision.annotationCount} annotation(s)\n`
  )

  process.stdout.write(buildOutput(), () => {
    server.shutdown()
    process.exit(0)
  })
}

/**
 * Bare invocation (no target, no --as): read an image from the macOS
 * clipboard, or print help. Unlike an explicit `--as image` with no target,
 * a missing/unreadable clipboard here is not an error — it's the same "tell
 * me what to do" signal a bare invocation on any other platform gets.
 */
async function runBareInvocation({ origin, viewportSpec }) {
  if (process.platform !== 'darwin') {
    printHelpAndExit(0)
    return
  }

  let clipboardPath
  try {
    clipboardPath = await saveClipboardImage()
  } catch {
    printHelpAndExit(0)
    return
  }

  await runImage({ targets: [], origin, viewportSpec, clipboardPath })
}

async function main() {
  const { help, targets, origin, viewportSpec, feedbackNotes, modeOverride, viewportFlagGiven, feedbackNotesFlagGiven, error } = parseArgs(process.argv)

  if (error) { fail(error); return }
  if (help) { printHelpAndExit(0); return }

  // A Claude Code chat image reaches us as the chip text, not a path. Exit 0
  // so the slash command still hands its instructions to the agent.
  if (targets.some((t) => t.startsWith('[Image'))) {
    process.stdout.write(CHAT_IMAGE_HINT)
    return
  }

  if (targets.length === 0 && !modeOverride) {
    await runBareInvocation({ origin, viewportSpec })
    return
  }

  let mode = modeOverride
  if (!mode) {
    const detected = await detectMode(targets)
    if (detected.error) { fail(detected.error); return }
    mode = detected.mode
  }

  if (mode === 'markdown' && viewportFlagGiven) {
    fail('--viewport only applies to image targets, not markdown files.')
    return
  }
  if (mode === 'image' && feedbackNotesFlagGiven) {
    fail('--feedback-notes only applies to markdown targets, not images.')
    return
  }

  if (mode === 'markdown') {
    await runMarkdown({ targets, origin, feedbackNotes })
  } else if (mode === 'image') {
    await runImage({ targets, origin, viewportSpec })
  } else {
    fail(`Unknown mode "${mode}". Valid: ${VALID_MODES.join(', ')}`)
  }
}

// Only run main() when this file is executed directly (`node index.js` or
// the `annotaitr`/`md-annotator` bin). Importing it for tests must not
// trigger it. import.meta.url is resolved through symlinks, but a globally
// npm-installed bin is invoked through one (e.g. /opt/homebrew/bin/annotaitr
// -> .../lib/node_modules/annotaitr/index.js), so process.argv[1] needs the
// same resolution or this check never matches and the CLI silently no-ops.
let entryPath
try {
  entryPath = realpathSync(process.argv[1])
} catch {
  entryPath = process.argv[1]
}
if (import.meta.url === `file://${entryPath}`) {
  main().catch((error) => {
    process.stderr.write(`Fatal: ${error.message}\n`)
    process.exit(1)
  })
}
