import { randomUUID } from 'node:crypto'
import { MAX_REPLY_LENGTH } from './reply.js'

function normalizeHandle(value) {
  return typeof value === 'string' ? value.trim().replace(/^#/, '').toLowerCase() : ''
}

/**
 * The reviewer's replies of the running round. They live only in memory
 * until the decision, like the round's annotations, and decide which of last
 * round's threads continue: only the ones the reviewer answered.
 */
export function createReplyStore(previous) {
  const pendingByHandle = new Map()

  const threadFor = (handle) => previous?.threads.find((t) => t.handle === handle)

  function add(rawHandle, text, { now = Date.now(), id = randomUUID() } = {}) {
    const handle = normalizeHandle(rawHandle)
    if (!threadFor(handle)) { return { error: `No thread #${handle} in round ${previous?.round ?? 0}`, status: 404 } }
    const trimmed = typeof text === 'string' ? text.trim() : ''
    if (!trimmed) { return { error: 'A reply needs text', status: 400 } }
    if (trimmed.length > MAX_REPLY_LENGTH) { return { error: `Reply text is longer than ${MAX_REPLY_LENGTH} characters`, status: 400 } }
    const reply = { id, author: 'human', text: trimmed, createdAt: now }
    const list = pendingByHandle.get(handle) ?? []
    pendingByHandle.set(handle, [...list, reply])
    return { reply }
  }

  function remove(rawHandle, id) {
    const handle = normalizeHandle(rawHandle)
    const list = pendingByHandle.get(handle)
    if (!list) { return false }
    const kept = list.filter((r) => r.id !== id)
    if (kept.length === list.length) { return false }
    if (kept.length === 0) { pendingByHandle.delete(handle) } else { pendingByHandle.set(handle, kept) }
    return true
  }

  const pending = (rawHandle) => pendingByHandle.get(normalizeHandle(rawHandle)) ?? []
  const count = () => [...pendingByHandle.values()].reduce((sum, list) => sum + list.length, 0)

  function carried() {
    return [...pendingByHandle.entries()].map(([handle, replies]) => {
      const thread = threadFor(handle)
      return {
        handle,
        number: null,
        origin: thread.origin ?? { round: previous.round, number: thread.number },
        annotation: thread.annotation,
        element: thread.element,
        replies: [...thread.replies, ...replies]
      }
    })
  }

  return { add, remove, pending, count, carried }
}
