export function createAnnotationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // crypto.randomUUID() requires a secure context (HTTPS, or localhost/127.0.0.1).
  // ANNOTAITR_HOST can be pointed at a non-loopback address for LAN access, where
  // the page is served over plain HTTP and the API is simply absent - fall back to
  // a manually-assembled v4 UUID instead of throwing on the very first annotation.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * A short, stable handle an agent can quote back across review rounds.
 *
 * Deliberately duplicated in server/core/annotationHandle.js: client and server
 * share no modules, and both need to derive the same handle from the same id.
 */
export function annotationHandle(id) {
  if (typeof id !== 'string') { return null }
  const [first] = id.split('-')
  return /^[0-9a-f]{8}$/i.test(first) ? first.toLowerCase() : null
}
