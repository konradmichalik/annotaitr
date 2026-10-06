/**
 * Image-mode adapter: wires the shared server bootstrap (server/core/server.js)
 * to the image API router and the image client bundle.
 */

import { startAnnotatorServer } from '../../core/server.js'
import { imageBundleDir as bundleDir } from '../common/bundle.js'
import { createApiRouter } from './routes.js'
import { createThreadsRouter } from '../common/threadsRoute.js'
import { transcriptionConfig, detectTranscription, createTranscriptionRouter } from '../common/transcribe.js'


/**
 * Start the image annotator server for a single already-captured image.
 *
 * @param {Object} options
 * @param {Buffer} options.imageBuffer
 * @param {number} options.imageWidth
 * @param {number} options.imageHeight
 * @param {string} [options.origin='cli']
 * @param {string} [options.targetLabel] - the URL or file path that was captured
 * @param {Array|null} [options.domMap] - elements of a captured page (server/image/common/domMap.js), only for URL captures
 * @param {Object|null} [options.captureSettings] - viewport, delay and section a URL was captured with
 * @param {Function|null} [options.recapture] - (settings) => capture, captures the URL again; only for URL captures
 * @param {Object|null} [options.session] - the opened review session (cli/session.js), serves last round at /api/threads
 * @param {Function} [options.onReady] - (url, port) => void
 */
export async function buildImageServer(options) {
  const {
    imageBuffer, imageWidth, imageHeight, origin = 'cli', targetLabel = null, domMap = null,
    captureSettings = null, recapture = null, session = null, onReady = null
  } = options

  const state = {
    annotations: [],
    capture: { buffer: imageBuffer, width: imageWidth, height: imageHeight, domMap, settings: captureSettings }
  }
  const transcription = transcriptionConfig()
  const voiceNotes = await detectTranscription(transcription)

  return startAnnotatorServer({
    bundleDir,
    staticDirs: [],
    onReady,
    mountRoutes(app, { safeResolve }) {
      app.use(createApiRouter({
        origin,
        targetLabel,
        state,
        voiceNotes,
        recapture,
        resolveDecision: safeResolve
      }))
      app.use(createThreadsRouter({
        session,
        current: () => ({ width: state.capture.width, height: state.capture.height })
      }))
      app.use(createTranscriptionRouter({ available: voiceNotes, config: transcription }))
    }
  })
}
