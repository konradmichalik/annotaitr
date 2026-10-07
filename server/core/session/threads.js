import { annotationHandle } from '../annotationHandle.js'
import { SCHEMA_VERSION } from './store.js'
import { REPLY_STATUSES } from './reply.js'
import { isNumbered } from '../notes.js'

/**
 * `annotations` are the decided notes in feedback order. A thread keeps the
 * number printed and baked into the output image; a general comment has none.
 */
export function buildThreads(annotations, describeElement = () => null) {
  return annotations.map((annotation, index) => ({
    handle: annotationHandle(annotation.id),
    number: isNumbered(annotation) ? (annotation.number ?? index + 1) : null,
    annotation,
    element: describeElement(annotation),
    replies: []
  }))
}

// Only the last round's marks are kept: round N shows round N-1 and its replies.
export function nextSession(previous, { sessionId, target, fingerprint = null, threads, now }) {
  return { schemaVersion: SCHEMA_VERSION, sessionId, round: (previous?.round ?? 0) + 1, writtenAt: now, target, fingerprint, threads }
}

export function sessionLine(session) {
  if (!session.threads.some((t) => t.handle)) { return '' }
  const id = session.sessionId
  // A blank line first, so the agent cannot read it as part of the last mark's comment.
  return `\nSession: ${id} (round ${session.round}). Reply per mark with: annotaitr reply --session ${id} ` +
    `--to <handle> --status ${REPLY_STATUSES.join('|')} --text "…"\n`
}
