import { useState, useRef, useCallback } from 'react'
import { uploadAttachment, MAX_ATTACHMENTS } from '../utils/attachments.js'

/** The images of the note being written: what is attached, whether an upload is in flight and the last error. */
export function useAttachments(initial = []) {
  const [attachments, setAttachments] = useState(initial)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState(null)
  const current = useRef(initial)
  // Uploads run side by side, so the limit counts the ones still on their way too.
  const inFlight = useRef(0)

  const update = (next) => {
    current.current = next
    setAttachments(next)
  }

  const add = useCallback(async (files) => {
    setError(null)
    const room = MAX_ATTACHMENTS - current.current.length - inFlight.current
    if (files.length > room) { setError(`A note takes at most ${MAX_ATTACHMENTS} images`) }
    await Promise.all(files.slice(0, Math.max(room, 0)).map(async (file) => {
      inFlight.current += 1
      setPending(inFlight.current)
      try {
        const added = await uploadAttachment(file)
        // Read the list only now: an image may have been removed during the upload.
        update([...current.current, added])
      } catch (uploadError) {
        setError(uploadError.message)
      } finally {
        inFlight.current -= 1
        setPending(inFlight.current)
      }
    }))
  }, [])

  const remove = useCallback((id) => {
    setError(null)
    update(current.current.filter((attachment) => attachment.id !== id))
  }, [])

  return { attachments, busy: pending > 0, error, add, remove }
}
