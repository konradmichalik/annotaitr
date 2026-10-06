import { resolve as resolvePath } from 'node:path'
import { isSupportedCaptureUrl } from '../server/image/common/fileTypes.js'
import { parseViewportSpec, parseDelay, describeCapture, MAX_DELAY_MS } from '../server/image/common/config.js'
import { saveClipboardImage } from '../server/image/still/clipboard.js'
import { captureFlagError } from './args.js'
import { fileExists, isPdfTarget, isVideoTarget } from './detect.js'
import { fail, printHelpAndExit } from './help.js'
import { serveUntilDecision } from './outcome.js'
import { openSession } from './session.js'
import { runVideo } from './video.js'
import { runDocument } from './document.js'

/**
 * Image mode's real work (server/image/still/loader.js, server/image/still/adapter.js)
 * pulls in playwright and @napi-rs/canvas — both optionalDependencies. Load
 * them dynamically, only once image mode is confirmed, so a markdown-only
 * install never needs them and a missing install gets an actionable error
 * instead of a crash on an unrelated command.
 */
async function loadImageRuntime() {
  try {
    const [loader, adapter] = await Promise.all([
      import('../server/image/still/loader.js'),
      import('../server/image/still/adapter.js')
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

  const flagError = captureFlagError('a local image file', { viewportSpec, delaySpec })
  if (flagError) { return { error: flagError } }

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

function imageSessionTarget(target, clipboardPath) {
  if (clipboardPath || !target) { return { identity: null, target: { kind: 'clipboard', label: 'clipboard image' } } }
  if (isSupportedCaptureUrl(target)) { return { identity: new URL(target).href, target: { kind: 'url', label: target } } }
  return { identity: resolvePath(target), target: { kind: 'file', label: target } }
}

export async function runImage({
  targets, origin, viewportSpec, delaySpec = null, clipboardPath, sourceSpec = null, pageRanges = null, session = {}
}) {
  if (targets.length === 1 && isPdfTarget(targets[0])) {
    await runDocument({ target: targets[0], origin, viewportSpec, delaySpec, sourceSpec, pageRanges, session })
    return
  }
  if (targets.length === 1 && isVideoTarget(targets[0])) {
    await runVideo({ target: targets[0], origin, viewportSpec, delaySpec, session })
    return
  }
  const opened = await openSession({ ...imageSessionTarget(targets[0], clipboardPath), ...session })
  if (opened.error) { fail(opened.error); return }
  const { loadImageFromFile, captureUrl, buildImageServer } = await loadImageRuntime()
  const { capture, targetLabel, settings = null, error } = await resolveImageCapture(
    targets, { viewportSpec, delaySpec }, { clipboardPath, loadImageFromFile, captureUrl }
  )
  if (error) { fail(error); return }

  await serveUntilDecision(await buildImageServer({
    imageBuffer: capture.buffer,
    imageWidth: capture.width,
    imageHeight: capture.height,
    domMap: capture.domMap ?? null,
    captureSettings: settings,
    // Only a URL can be captured again with other settings from the open tab.
    recapture: settings ? (next) => captureUrl(targetLabel, next.viewport, next) : null,
    origin,
    targetLabel
  }), opened)
}

/**
 * Bare invocation (no target, no --as): read an image from the macOS
 * clipboard, or print help. Unlike an explicit `--as image` with no target,
 * a missing/unreadable clipboard here is not an error — it's the same "tell
 * me what to do" signal a bare invocation on any other platform gets.
 */
export async function runBareInvocation({ origin, viewportSpec, session = {} }) {
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

  await runImage({ targets: [], origin, viewportSpec, clipboardPath, session })
}
