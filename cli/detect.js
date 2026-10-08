import { resolve as resolvePath } from 'node:path'
import { access, constants } from 'node:fs/promises'
import { isAnnotatableFile, supportedExtensions as markdownExtensions } from '../server/markdown/file.js'
import { isImageFile, isVideoFile, isPdfFile, isSupportedCaptureUrl, videoExtensions } from '../server/image/common/fileTypes.js'

export async function fileExists(path) {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

/** A local PDF. A URL is captured as a page, whatever its path ends in. */
export function isPdfTarget(target) {
  return isPdfFile(target) && !isSupportedCaptureUrl(target)
}

/** A local video or GIF. A URL is captured as a page, whatever its path ends in. */
export function isVideoTarget(target) {
  return isVideoFile(target) && !isSupportedCaptureUrl(target)
}

/**
 * Decide which mode to run in, per the detection rules in the merge spec:
 * 0. --as override (handled by the caller before this runs)
 * 1. no target: handled by the caller (clipboard read, macOS only)
 * 2. every target exists and is markdown/plain-text -> markdown (multiple allowed)
 * 3. a single http(s) URL -> image (capture)
 * 4. a single existing file with a supported image extension -> image (local file)
 * 3b. several existing image files -> image (file set)
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

  if (targets.length > 1) {
    const imageChecks = await Promise.all(resolved.map(async (p) => (await fileExists(p)) && isImageFile(p)))
    if (imageChecks.every(Boolean)) {
      return { mode: 'image', capture: 'files', resolvedPaths: resolved }
    }
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
      'Multiple targets are only supported for several markdown/plain-text files or several image files. ' +
      'URLs, videos and PDFs take exactly one target. Use --as to force a mode.'
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
