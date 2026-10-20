export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_ATTACHMENTS = 5
const MAX_BYTES = 10 * 1024 * 1024

export const attachmentUrl = (attachment) => `/api/attachments/${encodeURIComponent(attachment.id)}`

/** Upload one image and answer what the note keeps of it, or throw with a message for the reviewer. */
export async function uploadAttachment(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) { throw new Error('Only PNG, JPEG and WebP images can be attached') }
  if (file.size > MAX_BYTES) { throw new Error(`${file.name} is larger than 10 MB`) }
  const response = await fetch('/api/attachments', { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.success) { throw new Error(body?.error ?? 'Could not attach the image') }
  return { id: body.data.id, path: body.data.path, name: file.name }
}

// Only the server's 404 says the file is gone; a failed request must not strip it from the saved draft.
const isAvailable = (attachment) => fetch(attachmentUrl(attachment), { method: 'HEAD' })
  .then((response) => response.status !== 404, () => true)

/** The notes of a restored draft without the images the server no longer holds, and how many were dropped. */
export async function withAvailableAttachments(annotations) {
  let dropped = 0
  const checked = await Promise.all(annotations.map(async (ann) => {
    if (!Array.isArray(ann.attachments)) { return ann }
    const available = await Promise.all(ann.attachments.map(isAvailable))
    const kept = ann.attachments.filter((_, i) => available[i])
    dropped += ann.attachments.length - kept.length
    return { ...ann, attachments: kept }
  }))
  return { annotations: checked, dropped }
}
