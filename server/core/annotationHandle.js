/**
 * A short, stable handle an agent can quote back across review rounds.
 *
 * It is the first group of the annotation's UUID, so client and server derive
 * it independently from the same id without sharing a module. Ids that are not
 * UUID-shaped get no handle: emitting a truncation of an arbitrary id would
 * risk two annotations sharing one handle, and a reply landing on the wrong
 * thread is worse than a thread with no handle at all.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function annotationHandle(id) {
  if (typeof id !== 'string' || !UUID.test(id)) { return null }
  return id.slice(0, 8).toLowerCase()
}
