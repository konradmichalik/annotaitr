/**
 * Video variant of image mode: wires the shared server bootstrap to the
 * video API router and the same image client bundle, which switches to its
 * player UI from the `kind` in /api/meta.
 */

import { rmSync } from 'node:fs'
import { startAnnotatorServer } from '../../core/server.js'
import { imageBundleDir as bundleDir } from '../common/bundle.js'
import { createVideoApiRouter } from './routes.js'
import { createThreadsRouter, videoDuration } from '../common/threadsRoute.js'
import { transcriptionConfig, detectTranscription, createTranscriptionRouter } from '../common/transcribe.js'


/**
 * @param {Object} options
 * @param {{ path: string, kind: 'video' | 'gif', mimeType: string }} options.video - from resolveVideoFile()
 * @param {string} [options.origin='cli']
 * @param {string} [options.targetLabel] - shown in the UI and named in the feedback
 * @param {Object|null} [options.session] - the opened review session (cli/session.js), serves last round at /api/threads
 * @param {Function} [options.onReady] - (url, port) => void
 */
export async function buildVideoServer({ video, origin = 'cli', targetLabel = null, session = null, onReady = null }) {
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
      app.use(createThreadsRouter({
        session,
        current: (req) => ({ kind: 'video', fingerprint: session?.fingerprint ?? null, duration: videoDuration(req) })
      }))
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
