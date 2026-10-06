#!/usr/bin/env node

import { resolve as resolvePath, basename } from 'node:path'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { access, constants } from 'node:fs/promises'
import { readEnvWithFallback } from './server/core/config.js'
import { openBrowser } from './server/core/browser.js'
import { withLifecycle } from './server/core/lifecycle.js'
import { isAnnotatableFile, supportedExtensions as markdownExtensions } from './server/markdown/file.js'
import { buildMarkdownServer } from './server/markdown/adapter.js'
import { formatApprovalOutput as formatMarkdownApproval } from './server/markdown/feedback.js'
import { isImageFile, isVideoFile, isPdfFile, isOfficeDocument, isSupportedCaptureUrl, videoExtensions } from './server/image/capture.js'
import { parsePageRanges } from './server/image/pages.js'
import { isSourceNewer, siblingPdf, pdfPathFor } from './server/image/source.js'
import { parseViewportSpec, parseDelay, describeCapture, MAX_DELAY_MS } from './server/image/config.js'
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

/**
 * A video needs no playwright (the browser plays it and grabs frames), only
 * @napi-rs/canvas to render the output, so it gets its own loader with its
 * own install hint.
 */
async function loadVideoRuntime() {
  try {
    const [video, adapter] = await Promise.all([
      import('./server/image/video.js'),
      import('./server/image/videoAdapter.js')
    ])
    return { resolveVideoFile: video.resolveVideoFile, buildVideoServer: adapter.buildVideoServer }
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        'Annotating a video needs @napi-rs/canvas, an optional dependency. Install it with: npm i @napi-rs/canvas'
      )
    }
    throw error
  }
}

/**
 * A PDF needs no playwright either, but pdf.js (loaded inside the render
 * worker, so resolved here up front to fail early) and @napi-rs/canvas.
 */
async function loadDocumentRuntime() {
  try {
    createRequire(import.meta.url).resolve('pdfjs-dist/package.json')
    const [document, adapter] = await Promise.all([
      import('./server/image/document.js'),
      import('./server/image/documentAdapter.js')
    ])
    return { openPdfDocument: document.openPdfDocument, buildDocumentServer: adapter.buildDocumentServer }
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'Reviewing a PDF needs pdfjs-dist and @napi-rs/canvas, which are optional dependencies. ' +
        'Install them with: npm i pdfjs-dist @napi-rs/canvas'
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
annotaitr — Annotate an image, a captured web page, a video or GIF, or
Markdown/plain-text files in the browser

Usage:
  annotaitr [options] [target ...]

Which mode runs is auto-detected from the target:
  - no target                  reads an image from the clipboard (macOS only)
  - one or more existing files, all markdown/plain-text   -> markdown mode
  - a single http(s) URL                                   -> image mode (capture)
  - a single existing image file (.png, .jpg, .jpeg, .webp, .svg) -> image mode
  - a single existing video or GIF (${videoExtensions().join(', ')}) -> image mode,
    annotated on a timeline, with every annotated frame exported as PNG
  - a single existing PDF                                  -> image mode, page by page,
    with every annotated page exported as PNG
  - a PowerPoint, Word, Keynote, Pages or OpenDocument file prints how to
    export it to PDF first, nothing is converted here

Options:
  --help                       Show this help message
  --origin <name>               Set caller origin (cli, claude-code, opencode, vibe)
  --as <image|markdown>         Skip detection, force a mode
  --viewport <preset|WxH>       Image mode only: desktop (default) | laptop | tablet | mobile | <W>x<H>
  --delay <ms>                  Image mode only: wait this long after the page loads before capturing (0 to 10000)
  --feedback-notes <json|path>  Markdown mode only: AI notes to display as read-only annotations
  --source <path>               PDF only: the file the PDF was rendered from, named in the feedback
  --pages <range>               PDF only: review only these pages, e.g. 1-5,8,12-

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
  ANNOTAITR_WHISPER_MODEL    Image mode: whisper.cpp model path, enables voice notes
  ANNOTAITR_WHISPER_BIN      Image mode: whisper.cpp binary (default: whisper-cli)
  ANNOTAITR_WHISPER_LANG     Image mode: voice note language, e.g. de (default: auto)
  ANNOTAITR_FEEDBACK_NOTES   Markdown mode: JSON string or file path for feedback notes
  (MD_ANNOTATOR_* still works as a deprecated fallback)

Examples:
  annotaitr README.md
  annotaitr docs/api.md docs/guide.md
  annotaitr ./mockup.png
  annotaitr http://localhost:3000
  annotaitr --viewport mobile http://localhost:3000/checkout
  annotaitr ./diagram.svg
  annotaitr ./bug-recording.mov
  annotaitr ./deck.pdf --source ./deck.pptx
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
      if (!args[i + 1]) {
        return { error: '--source requires the path of the file the PDF was rendered from' }
      }
      sourceSpec = args[++i]
    } else if (arg === '--pages') {
      if (!args[i + 1]) {
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
 * 4b. a single existing video or GIF -> image (video capture)
 * 4c. a single existing PDF -> image (document review)
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
    if ((await fileExists(abs)) && isVideoFile(abs)) {
      return { mode: 'image', capture: 'video', resolvedPath: abs }
    }
    if ((await fileExists(abs)) && isPdfFile(abs)) {
      return { mode: 'image', capture: 'document', resolvedPath: abs }
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
    `Video extensions: ${videoExtensions().join(', ')}\n` +
    'Documents: .pdf\n' +
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

async function resolveImageCapture(targets, { viewportSpec, delaySpec }, { clipboardPath, loadImageFromFile, captureUrl } = {}) {
  if (clipboardPath) {
    return { capture: await loadImageFromFile(clipboardPath), targetLabel: 'clipboard image' }
  }

  const [target] = targets

  if (target && isSupportedCaptureUrl(target)) {
    const viewport = parseViewportSpec(viewportSpec)
    if (!viewport) {
      return { error: `Unknown viewport "${viewportSpec}". Use desktop, laptop, tablet, mobile, or WxH.` }
    }
    const delayMs = delaySpec === null ? 0 : parseDelay(delaySpec)
    if (delayMs === null) {
      return { error: `--delay must be a whole number of milliseconds from 0 to ${MAX_DELAY_MS}.` }
    }
    const settings = { viewport, delayMs, section: null }
    process.stderr.write(`Capturing ${target} at ${describeCapture(settings)}...\n`)
    return { capture: await captureUrl(target, viewport, settings), targetLabel: target, settings }
  }

  if (viewportSpec) {
    return { error: '--viewport only applies to a URL target, not a local image file.' }
  }
  if (delaySpec !== null) {
    return { error: '--delay only applies to a URL target, not a local image file.' }
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

async function runVideo({ target, origin, viewportSpec, delaySpec }) {
  if (viewportSpec) {
    fail('--viewport only applies to a URL target, not a video file.')
    return
  }
  if (delaySpec !== null) {
    fail('--delay only applies to a URL target, not a video file.')
    return
  }
  const { resolveVideoFile, buildVideoServer } = await loadVideoRuntime()
  let video
  try {
    video = await resolveVideoFile(resolvePath(target))
  } catch (error) {
    fail(error.message)
    return
  }

  const server = withLifecycle(await buildVideoServer({ video, origin, targetLabel: basename(target) }))
  process.stderr.write(`Server running at ${server.url}\n`)
  await openBrowser(server.url)

  const decision = await server.waitForDecision()
  await handleOutcome(server, decision, () => decision.output)
}

/** A local PDF. A URL is captured as a page, whatever its path ends in. */
export function isPdfTarget(target) {
  return isPdfFile(target) && !isSupportedCaptureUrl(target)
}

// Leaves plain paths as typed, so the hint reads like a command a person would write.
function shellArg(value) {
  return /^[\w./@:+-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`
}

/**
 * An office document is reviewed as the PDF its own tool exports. The hint
 * is for the agent that built the file (it knows how to render it) and for
 * a person running the CLI by hand alike, so it carries the next command.
 */
async function convertHint(target) {
  const { document: trimmed, pdf: pdfPath } = pdfPathFor(target)
  const command = `annotaitr ${shellArg(pdfPath)} --source ${shellArg(trimmed)}`
  const name = basename(trimmed)
  const next = (await siblingPdf(resolvePath(trimmed)))
    ? `${basename(pdfPath)} already exists and is not older than ${name}. If it is current, run:`
    : `Export ${name} to PDF with the tool that created it, then run:`
  return `CONVERT TO PDF FIRST: ${trimmed}\nannotaitr reviews documents as PDF. ${next}\n  ${command}\n`
}

/** A local video or GIF. A URL is captured as a page, whatever its path ends in. */
export function isVideoTarget(target) {
  return isVideoFile(target) && !isSupportedCaptureUrl(target)
}

async function runDocument({ target, origin, viewportSpec, delaySpec, sourceSpec, pageRanges }) {
  if (viewportSpec) {
    fail('--viewport only applies to a URL target, not a PDF.')
    return
  }
  if (delaySpec !== null) {
    fail('--delay only applies to a URL target, not a PDF.')
    return
  }
  const pdfPath = resolvePath(target)
  if (!(await fileExists(pdfPath))) {
    fail(`File not found: ${pdfPath}`)
    return
  }
  const sourcePath = sourceSpec ? resolvePath(sourceSpec) : null
  if (sourcePath && !(await fileExists(sourcePath))) {
    fail(`Source not found: ${sourcePath}`)
    return
  }

  const { openPdfDocument, buildDocumentServer } = await loadDocumentRuntime()
  let document
  try {
    document = await openPdfDocument(pdfPath, { pageRanges })
  } catch (error) {
    fail(error.message)
    return
  }

  const freshness = sourcePath ? await isSourceNewer(sourcePath, pdfPath) : { newer: false }
  const source = sourcePath ? { label: basename(sourcePath), newer: freshness.newer === true } : null
  if (source?.newer) {
    process.stderr.write(`Warning: ${source.label} is newer than ${basename(pdfPath)}. The PDF may be outdated, regenerate it before reviewing.\n`)
  }
  if (freshness.skipped) { process.stderr.write(`Note: ${freshness.skipped}.\n`) }

  const server = withLifecycle(await buildDocumentServer({ document, source, origin, targetLabel: basename(pdfPath) }))
  process.stderr.write(`Server running at ${server.url}\n`)
  await openBrowser(server.url)

  const decision = await server.waitForDecision()
  await handleOutcome(server, decision, () => decision.output)
}

async function runImage({ targets, origin, viewportSpec, delaySpec = null, clipboardPath, sourceSpec = null, pageRanges = null }) {
  if (targets.length === 1 && isPdfTarget(targets[0])) {
    await runDocument({ target: targets[0], origin, viewportSpec, delaySpec, sourceSpec, pageRanges })
    return
  }
  if (targets.length === 1 && isVideoTarget(targets[0])) {
    await runVideo({ target: targets[0], origin, viewportSpec, delaySpec })
    return
  }
  const { loadImageFromFile, captureUrl, buildImageServer } = await loadImageRuntime()
  const { capture, targetLabel, settings = null, error } = await resolveImageCapture(
    targets, { viewportSpec, delaySpec }, { clipboardPath, loadImageFromFile, captureUrl }
  )
  if (error) { fail(error); return }

  const server = withLifecycle(await buildImageServer({
    imageBuffer: capture.buffer,
    imageWidth: capture.width,
    imageHeight: capture.height,
    domMap: capture.domMap ?? null,
    captureSettings: settings,
    // Only a URL can be captured again with other settings from the open tab.
    recapture: settings ? (next) => captureUrl(targetLabel, next.viewport, next) : null,
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
  const {
    help, targets, origin, viewportSpec, delaySpec, feedbackNotes, modeOverride, viewportFlagGiven, feedbackNotesFlagGiven,
    sourceSpec, pageRanges, error
  } = parseArgs(process.argv)

  if (error) { fail(error); return }
  if (help) { printHelpAndExit(0); return }

  // A Claude Code chat image reaches us as the chip text, not a path. Exit 0
  // so the slash command still hands its instructions to the agent.
  if (targets.some((t) => t.startsWith('[Image'))) {
    process.stdout.write(CHAT_IMAGE_HINT)
    return
  }

  // Not a mode: nothing is opened, the agent gets told how to make a PDF.
  if (targets.length === 1 && isOfficeDocument(targets[0]) && (await fileExists(resolvePath(targets[0])))) {
    process.stdout.write(await convertHint(targets[0]))
    return
  }

  const pdfTarget = targets.length === 1 && isPdfTarget(targets[0])
  for (const [flag, given] of [['--source', sourceSpec !== null], ['--pages', pageRanges !== null]]) {
    if (given && !pdfTarget) {
      fail(`${flag} only applies to a PDF target.`)
      return
    }
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
  if (mode === 'markdown' && delaySpec !== null) {
    fail('--delay only applies to a URL target, not markdown files.')
    return
  }
  if (mode === 'image' && feedbackNotesFlagGiven) {
    fail('--feedback-notes only applies to markdown targets, not images.')
    return
  }

  if (mode === 'markdown') {
    await runMarkdown({ targets, origin, feedbackNotes })
  } else if (mode === 'image') {
    await runImage({ targets, origin, viewportSpec, delaySpec, sourceSpec, pageRanges })
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
