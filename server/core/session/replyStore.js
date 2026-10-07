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
  let frozen = null
  const closed = () => ({ error: 'The round is already decided', status: 409 })

  const threadFor = (handle) => previous?.threads.find((t) => t.handle === handle)

  function add(rawHandle, text, { now = Date.now(), id = randomUUID() } = {}) {
    if (frozen) { return closed() }
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
    if (frozen) { return closed() }
    const handle = normalizeHandle(rawHandle)
    const list = pendingByHandle.get(handle)
    const kept = list?.filter((r) => r.id !== id)
    if (!list || kept.length === list.length) { return { error: `No pending reply ${id}`, status: 404 } }
    if (kept.length === 0) { pendingByHandle.delete(handle) } else { pendingByHandle.set(handle, kept) }
    return { removed: true }
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
        // Its geometry belongs to the round it was first drawn in, not to the one before this.
        fingerprint: thread.fingerprint ?? previous.fingerprint ?? null,
        replies: [...thread.replies, ...replies]
      }
    })
  }

  /**
   * Called the moment a decision is made: from then on the store rejects
   * changes, so what the output is built from cannot differ from what the
   * reviewer saw when deciding. The snapshot travels with the decision.
   */
  function freeze() {
    frozen ??= { carried: carried(), replyCount: count() }
    return frozen
  }

  return { add, remove, pending, count, carried: () => frozen?.carried ?? carried(), freeze }
}

/** The decision fields for sessions without replies, so routes can spread the result either way. */
export const freezeReplies = (replies) => replies?.freeze() ?? { carried: [], replyCount: 0 }
