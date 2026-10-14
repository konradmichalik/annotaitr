import { Router } from 'express'
import { success, failure } from '../http.js'

function withPending(threads, replies) {
  if (!replies) { return threads }
  return threads.map((t) => {
    const pending = t.handle ? replies.pending(t.handle) : []
    return pending.length > 0 ? { ...t, replies: [...t.replies, ...pending.map((r) => ({ ...r, pending: true }))] } : t
  })
}

/**
 * Last round's marks and replies, placed by the mode: `anchor(previous, req)`
 * returns the threads with where each one is in this round. The reply routes
 * add and remove the reviewer's pending replies in the running round.
 */
export function createSessionThreadsRouter({ session, anchor }) {
  const router = Router()
  router.get('/api/threads', async (req, res) => {
    const previous = session?.previous ?? null
    res.json(success({
      sessionId: session?.sessionId ?? null,
      round: previous?.round ?? null,
      threads: withPending(await anchor(previous, req), session?.replies)
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
