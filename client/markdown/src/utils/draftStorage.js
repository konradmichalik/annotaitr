/**
 * Markdown drafts live under the file's content hash and under the file id
 * the server derives from its absolute path. The file id copy outlives an
 * edit of the file, which changes the hash.
 */

const STORAGE_PREFIX = 'md-annotator-draft-'

function draftKeys({ contentHash, fileId }) {
  return [
    contentHash ? `${STORAGE_PREFIX}${contentHash}` : null,
    fileId ? `${STORAGE_PREFIX}file-${fileId}` : null
  ]
}

function readKey(storage, key) {
  if (!key) { return null }
  try {
    const data = JSON.parse(storage.getItem(key))
    return Array.isArray(data?.annotations) && data.annotations.length > 0 ? data : null
  } catch {
    return null
  }
}

/** The draft for this file as `{ annotations, ts, contentHash, fileChanged }`, or null. */
export function readDraft(storage, file) {
  const [hashKey, pathKey] = draftKeys(file)
  const data = readKey(storage, hashKey) ?? readKey(storage, pathKey)
  if (!data) { return null }
  const fileChanged = Boolean(data.contentHash) && data.contentHash !== file.contentHash
  return { annotations: data.annotations, ts: data.ts || 0, contentHash: data.contentHash ?? null, fileChanged }
}

export function writeDraft(storage, file, annotations, ts) {
  const value = JSON.stringify({ annotations, ts, contentHash: file.contentHash })
  for (const key of draftKeys(file)) {
    if (!key) { continue }
    try { storage.setItem(key, value) } catch { /* storage full or unavailable */ }
  }
}

export function clearDraft(storage, file) {
  for (const key of draftKeys(file)) {
    if (!key) { continue }
    try { storage.removeItem(key) } catch { /* storage unavailable */ }
  }
}
