import { extname } from 'node:path'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg'])
// GIF counts as video: it can carry many frames, and a still image tool
// would silently show only the first one. The MIME type is what the server
// sends, so the browser picks the right decoder.
export const VIDEO_MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.gif': 'image/gif'
}

export const videoExtensions = () => Object.keys(VIDEO_MIME_TYPES)

// Reviewed as a PDF exported by whatever produced them, never converted here.
// Keynote and Pages documents can be package directories, which extname()
// still reads correctly with a trailing slash.
const OFFICE_EXTENSIONS = new Set(['.pptx', '.ppt', '.odp', '.key', '.docx', '.doc', '.odt', '.rtf', '.pages'])

/**
 * Pure, dependency-free detection helpers, kept separate from
 * server/image/loader.js so index.js can decide the mode (markdown vs.
 * image) without pulling in playwright or @napi-rs/canvas — both
 * optionalDependencies — for a target that turns out to be markdown.
 */
export function isImageFile(filePath) {
  return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase())
}

export function isVideoFile(filePath) {
  return Object.hasOwn(VIDEO_MIME_TYPES, extname(filePath).toLowerCase())
}

export function isGifFile(filePath) {
  return extname(filePath).toLowerCase() === '.gif'
}

export function isPdfFile(filePath) {
  return extname(filePath).toLowerCase() === '.pdf'
}

export function isOfficeDocument(filePath) {
  return OFFICE_EXTENSIONS.has(extname(filePath).toLowerCase())
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
