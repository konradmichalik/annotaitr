import { annotationHandle } from '../annotationHandle.js'
import { SCHEMA_VERSION } from './store.js'
import { REPLY_STATUSES } from './reply.js'

/** `annotations` must be in feedback order: the number is the one printed and baked into the output image. */
export function buildThreads(annotations, describeElement = () => null) {
  return annotations.map((annotation, index) => ({
    handle: annotationHandle(annotation.id),
    number: index + 1,
    annotation,
    element: describeElement(annotation),
    replies: []
  }))
}

// Only the last round's marks are kept: round N shows round N-1 and its replies.
export function nextSession(previous, { sessionId, target, threads, now }) {
  return { schemaVersion: SCHEMA_VERSION, sessionId, round: (previous?.round ?? 0) + 1, writtenAt: now, target, threads }
}

export function sessionLine(session) {
  if (!session.threads.some((t) => t.handle)) { return '' }
  const id = session.sessionId
  // A blank line first, so the agent cannot read it as part of the last mark's comment.
  return `\nSession: ${id} (round ${session.round}). Reply per mark with: annotaitr reply --session ${id} ` +
    `--to <handle> --status ${REPLY_STATUSES.join('|')} --text "…"\n`
}
