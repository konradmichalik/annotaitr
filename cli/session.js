import { join } from 'node:path'
import { sessionIdFor, newSessionId } from '../server/core/session/identity.js'
import { readSession, writeSession, pruneSessions, sessionDir, RESUME_WINDOW_MS } from '../server/core/session/store.js'
import { createReplyStore } from '../server/core/session/replyStore.js'
import { buildThreads, nextSession, sessionLine } from '../server/core/session/threads.js'
import { matchAnnotation, describeMatch } from '../server/image/common/elementMatch.js'

const stderrLine = (line) => process.stderr.write(`${line}\n`)

async function resumeNamed(sessionId, target, dir) {
  const read = await readSession(sessionId, dir)
  if (read.missing) { return { error: `No review session ${sessionId} in ${dir}` } }
  if (read.error) { return { error: read.error } }
  return { sessionId, target, previous: read.session, replies: createReplyStore(read.session) }
}

/**
 * The session a run continues, or a fresh one. `identity` is null for a
 * target that cannot be found again (the clipboard), which only resumes by name.
 */
export async function openSession({
  identity, target, sessionId = null, newSession = false, now = Date.now(), dir = sessionDir(), log = stderrLine
}) {
  await pruneSessions(now, dir)
  if (sessionId) { return resumeNamed(sessionId, target, dir) }

  const id = identity ? sessionIdFor(identity) : newSessionId()
  const fresh = { sessionId: id, target, previous: null, replies: createReplyStore(null) }
  if (!identity || newSession) { return fresh }

  const read = await readSession(id, dir)
  if (read.missing) { return fresh }
  if (read.error) {
    log(`${read.error}. Starting a new review session.`)
    return fresh
  }
  if (now - read.session.writtenAt > RESUME_WINDOW_MS) {
    log(`Ignoring review session ${join(dir, `${id}.json`)} from more than 24 hours ago.`)
    return fresh
  }
  log(`Continuing review session ${id} at round ${read.session.round + 1}. Start over with --new-session.`)
  return { sessionId: id, target, previous: read.session, replies: createReplyStore(read.session) }
}

/** Save the decided round. Returns the line telling the agent how to reply, or '' when there is nothing to reply to or saving failed. */
export async function recordSession(opened, decision, { now = Date.now(), dir = sessionDir(), log = stderrLine } = {}) {
  const describeElement = (annotation) => describeMatch(matchAnnotation(decision.domMap, annotation))
  const threads = buildThreads(decision.annotations ?? [], describeElement)
  const session = nextSession(opened.previous, {
    sessionId: opened.sessionId, target: opened.target, fingerprint: await opened.fingerprint, threads, now
  })
  try {
    await writeSession(session, dir)
  } catch (error) {
    // The review itself already happened; losing the session must not lose the decision.
    log(`Warning: could not save review session ${opened.sessionId}: ${error.message}`)
    return ''
  }
  return sessionLine(session)
}
