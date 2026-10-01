/**
 * Video variant of image mode: wires the shared server bootstrap to the
 * video API router and the same image client bundle, which switches to its
 * player UI from the `kind` in /api/meta.
 */

import { existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { startAnnotatorServer } from '../core/server.js'
import { createVideoApiRouter } from './videoRoutes.js'
import { transcriptionConfig, detectTranscription, createTranscriptionRouter } from './transcribe.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '..', '..', 'client', 'dist', 'image')
const DEV_DIR = join(__dirname, '..', '..', 'client', 'image')
const bundleDir = existsSync(join(DIST_DIR, 'index.html')) ? DIST_DIR : DEV_DIR

/**
 * @param {Object} options
 * @param {{ path: string, kind: 'video' | 'gif', mimeType: string }} options.video - from resolveVideoFile()
 * @param {string} [options.origin='cli']
 * @param {string} [options.targetLabel] - shown in the UI and named in the feedback
 * @param {Function} [options.onReady] - (url, port) => void
 */
export async function buildVideoServer({ video, origin = 'cli', targetLabel = null, onReady = null }) {
  const state = {
    annotations: [], planTimes: null, rawFrames: null, rawDir: null, media: null,
    planning: false, deciding: false, decided: false
  }

  const transcription = transcriptionConfig()
  const voiceNotes = await detectTranscription(transcription)

  const server = await startAnnotatorServer({
    bundleDir,
    staticDirs: [],
    onReady,
    mountRoutes(app, { safeResolve }) {
      app.use(createVideoApiRouter({ video, origin, targetLabel, state, voiceNotes, resolveDecision: safeResolve }))
      app.use(createTranscriptionRouter({ available: voiceNotes, config: transcription }))
    }
  })

  // Uploaded frames are only deleted once a decision is rendered. A closed
  // tab, Ctrl+C or a failed render ends the process through stop() instead,
  // which runs just before exit, so the removal is synchronous.
  return {
    ...server,
    stop() {
      server.stop()
      if (state.rawDir) { rmSync(state.rawDir, { recursive: true, force: true }) }
    }
  }
}
