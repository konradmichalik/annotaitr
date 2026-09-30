import { extname } from 'node:path'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg'])

/**
 * Pure, dependency-free detection helpers, kept separate from
 * server/image/loader.js so index.js can decide the mode (markdown vs.
 * image) without pulling in playwright or @napi-rs/canvas — both
 * optionalDependencies — for a target that turns out to be markdown.
 */
export function isImageFile(filePath) {
  return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase())
}

export function isSvgFile(filePath) {
  return extname(filePath).toLowerCase() === '.svg'
}

export function isSupportedCaptureUrl(value) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
