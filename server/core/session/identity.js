import { createHash, randomBytes } from 'node:crypto'

const SESSION_ID = /^[0-9a-f]{12}$/

/** Only this shape may name a session file: anything else could point outside the session directory. */
export function isSessionId(value) {
  return typeof value === 'string' && SESSION_ID.test(value)
}

/** The id of a target that can be found again: an absolute path or a normalised URL. */
export function sessionIdFor(identity) {
  return createHash('sha256').update(identity).digest('hex').slice(0, 12)
}

/** A clipboard image cannot be found again by its target, so its session gets a random id. */
export function newSessionId() {
  return randomBytes(6).toString('hex')
}

export function urlIdentity(url) {
  return new URL(url).href
}
