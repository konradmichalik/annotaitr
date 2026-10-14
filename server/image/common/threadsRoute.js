import { createSessionThreadsRouter } from '../../core/session/threadsRoute.js'
import { anchorThreads } from './anchorThreads.js'

/** The video duration the client passes once the metadata has loaded; the server never decodes the video itself. */
export function videoDuration(req) {
  const value = Number(req.query.duration)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Last round's marks and replies. Kind and fingerprint come from the session;
 * `current(req)` adds what only the adapter knows (image size, pages, duration)
 * and is read per request, so a recapture at another viewport is reflected.
 */
export function createThreadsRouter({ session, current }) {
  return createSessionThreadsRouter({
    session,
    anchor: async (previous, req) => {
      const facts = { kind: session?.target.kind, fingerprint: await session?.fingerprint ?? null, ...current(req) }
      return anchorThreads(previous, facts)
    }
  })
}
