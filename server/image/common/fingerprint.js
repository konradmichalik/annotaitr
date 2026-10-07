import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

/** For bytes already read for review, so the fingerprint describes exactly what was shown. */
export function hashBuffer(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`
}

/** Identifies the reviewed content across runs: an unchanged file anchors last round's marks exactly. */
export async function hashFile(path) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return `sha256:${hash.digest('hex')}`
}

/**
 * Started next to the server instead of before it, so a large video does not
 * hold back the browser. Settles on null when the file cannot be read: the
 * marks then show as ghosts, and the review itself never fails on it.
 */
export function fingerprintInBackground(path) {
  return hashFile(path).catch(() => null)
}
