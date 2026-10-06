import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { isVideoFile, isGifFile, VIDEO_MIME_TYPES, videoExtensions } from '../common/fileTypes.js'
import { config } from '../common/config.js'

/**
 * Validate a local video or GIF before the browser opens. Nothing is decoded
 * here: the browser plays and grabs frames itself, so the server only needs
 * to know the file exists, is not oversized and which MIME type to serve.
 */
export async function resolveVideoFile(filePath) {
  if (!isVideoFile(filePath)) {
    throw new Error(`Unsupported video format: ${filePath}. Supported: ${videoExtensions().join(', ')}`)
  }

  let stats
  try {
    stats = await stat(filePath)
  } catch {
    throw new Error(`File not found: ${filePath}`)
  }

  const gif = isGifFile(filePath)
  const maxBytes = gif ? config.maxGifBytes : config.maxVideoBytes
  if (stats.size > maxBytes) {
    throw new Error(`${gif ? 'GIF' : 'Video'} too large: ${filePath} (${stats.size} bytes, max ${maxBytes})`)
  }

  return { path: filePath, kind: gif ? 'gif' : 'video', mimeType: VIDEO_MIME_TYPES[extname(filePath).toLowerCase()] }
}
