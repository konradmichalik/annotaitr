/**
 * Image-mode adapter: wires the shared server bootstrap (server/core/server.js)
 * to the image API router and the image client bundle.
 */

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { startAnnotatorServer } from '../core/server.js'
import { createApiRouter } from './routes.js'
import { transcriptionConfig, detectTranscription, createTranscriptionRouter } from './transcribe.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '..', '..', 'client', 'dist', 'image')
const DEV_DIR = join(__dirname, '..', '..', 'client', 'image')
const bundleDir = existsSync(join(DIST_DIR, 'index.html')) ? DIST_DIR : DEV_DIR

/**
 * Start the image annotator server for a single already-captured image.
 *
 * @param {Object} options
 * @param {Buffer} options.imageBuffer
 * @param {number} options.imageWidth
 * @param {number} options.imageHeight
 * @param {string} [options.origin='cli']
 * @param {string} [options.targetLabel] - the URL or file path that was captured
 * @param {Function} [options.onReady] - (url, port) => void
 */
export async function buildImageServer(options) {
  const { imageBuffer, imageWidth, imageHeight, origin = 'cli', targetLabel = null, onReady = null } = options

  const state = { annotations: [] }
  const transcription = transcriptionConfig()
  const voiceNotes = await detectTranscription(transcription)

  return startAnnotatorServer({
    bundleDir,
    staticDirs: [],
    onReady,
    mountRoutes(app, { safeResolve }) {
      app.use(createApiRouter({
        imageBuffer,
        imageWidth,
        imageHeight,
        origin,
        targetLabel,
        state,
        voiceNotes,
        resolveDecision: safeResolve
      }))
      app.use(createTranscriptionRouter({ available: voiceNotes, config: transcription }))
    }
  })
}
