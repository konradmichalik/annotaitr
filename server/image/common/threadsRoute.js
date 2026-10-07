import { Router } from 'express'
import { success, failure } from '../../core/http.js'
import { anchorThreads } from './anchorThreads.js'

/** The video duration the client passes once the metadata has loaded; the server never decodes the video itself. */
export function videoDuration(req) {
  const value = Number(req.query.duration)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function withPending(threads, replies) {
  if (!replies) { return threads }
  return threads.map((t) => {
    const pending = t.handle ? replies.pending(t.handle) : []
    return pending.length > 0 ? { ...t, replies: [...t.replies, ...pending.map((r) => ({ ...r, pending: true }))] } : t
  })
}

/**
 * Last round's marks and replies. Kind and fingerprint come from the session;
 * `current(req)` adds what only the adapter knows (image size, pages, duration)
 * and is read per request, so a recapture at another viewport is reflected.
 * The reply routes add and remove the reviewer's pending replies in the running round.
 */
export function createThreadsRouter({ session, current }) {
  const router = Router()
  router.get('/api/threads', async (req, res) => {
    const previous = session?.previous ?? null
    const facts = { kind: session?.target.kind, fingerprint: await session?.fingerprint ?? null, ...current(req) }
    res.json(success({
      sessionId: session?.sessionId ?? null,
      round: previous?.round ?? null,
      threads: withPending(anchorThreads(previous, facts), session?.replies)
    }))
  })

  router.post('/api/threads/:handle/replies', (req, res) => {
    if (!session?.replies) { return res.status(404).json(failure('No review session to reply in')) }
    const result = session.replies.add(req.params.handle, req.body?.text)
    if (result.error) { return res.status(result.status).json(failure(result.error)) }
    res.json(success({ reply: result.reply }))
  })

  router.delete('/api/threads/:handle/replies/:id', (req, res) => {
    if (!session?.replies) { return res.status(404).json(failure('No review session to reply in')) }
    const result = session.replies.remove(req.params.handle, req.params.id)
    if (result.error) { return res.status(result.status).json(failure(result.error)) }
    res.json(success({ removed: true }))
  })
  return router
}
