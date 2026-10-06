/**
 * Document variant of image mode: wires the shared server bootstrap to the
 * document API router and the same image client bundle, which switches to
 * its page UI from the `kind` in /api/meta.
 */

import { startAnnotatorServer } from '../../core/server.js'
import { imageBundleDir as bundleDir } from '../common/bundle.js'
import { createDocumentApiRouter } from './routes.js'
import { createDocumentCaches } from './pdfDocument.js'
import { transcriptionConfig, detectTranscription, createTranscriptionRouter } from '../common/transcribe.js'


/**
 * @param {Object} options
 * @param {Object} options.document - from openPdfDocument()
 * @param {{ label: string, newer: boolean }|null} [options.source] - the file the PDF was rendered from (--source)
 * @param {string} [options.origin='cli']
 * @param {string} [options.targetLabel] - the PDF's file name, shown in the UI and named in the feedback
 * @param {Function} [options.onReady] - (url, port) => void
 */
export async function buildDocumentServer({ document, source = null, origin = 'cli', targetLabel = null, onReady = null }) {
  const state = { annotations: [], deciding: false, decided: false }
  const caches = createDocumentCaches(document)

  const transcription = transcriptionConfig()
  const voiceNotes = await detectTranscription(transcription)

  const server = await startAnnotatorServer({
    bundleDir,
    staticDirs: [],
    onReady,
    mountRoutes(app, { safeResolve }) {
      app.use(createDocumentApiRouter({ document, source, origin, targetLabel, state, caches, voiceNotes, resolveDecision: safeResolve }))
      app.use(createTranscriptionRouter({ available: voiceNotes, config: transcription }))
    }
  })

  return {
    ...server,
    stop() {
      server.stop()
      document.renderer.close()
    }
  }
}
