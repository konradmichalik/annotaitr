import { randomUUID } from 'node:crypto'

// Closed on purpose: the client colours, sorts and filters on it, which prose does not allow.
export const REPLY_STATUSES = ['applied', 'partial', 'declined', 'deferred', 'question']
export const MAX_REPLY_LENGTH = 4000

function normalizeHandle(value) {
  return typeof value === 'string' ? value.trim().replace(/^#/, '').toLowerCase() : ''
}

function replyError(session, { handle, status, text }) {
  if (!session.threads.some((t) => t.handle && t.handle === handle)) {
    const known = session.threads.map((t) => t.handle).filter(Boolean).map((h) => `#${h}`)
    return `No mark #${handle} in session ${session.sessionId} (round ${session.round}). Known: ${known.join(', ') || 'none'}`
  }
  if (!REPLY_STATUSES.includes(status)) { return `Unknown status "${status}". Valid: ${REPLY_STATUSES.join(', ')}` }
  if (!text) { return 'A reply needs --text: what was changed, what is left, why, when, or the question' }
  if (text.length > MAX_REPLY_LENGTH) { return `Reply text is longer than ${MAX_REPLY_LENGTH} characters` }
  return null
}

export function addReply(session, { to, status, text, now, id = randomUUID() }) {
  const handle = normalizeHandle(to)
  const trimmed = typeof text === 'string' ? text.trim() : ''
  const error = replyError(session, { handle, status, text: trimmed })
  if (error) { return { error } }
  const reply = { id, author: 'agent', status, text: trimmed, createdAt: now }
  const threads = session.threads.map((t) => (t.handle === handle ? { ...t, replies: [...t.replies, reply] } : t))
  return { session: { ...session, threads }, thread: threads.find((t) => t.handle === handle) }
}
