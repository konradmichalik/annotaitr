import { useCallback, useEffect, useRef, useState } from 'react'
import { hasMark } from './threadView.js'

/**
 * Which last-round thread has its popover open, and where it hangs: on the canvas mark (`openThreadHandle`)
 * or, for a thread without a mark, at its panel entry or timeline tick (`entryThread`).
 * `previousThreads` are the threads placed in the current view, `seekTo` moves the media to a thread's mark.
 */
export function useThreadPopover({ previousThreads, seekTo }) {
  const [showPrevious, setShowPrevious] = useState(true)
  const [openThreadHandle, setOpenThreadHandle] = useState(null)
  const [entryThread, setEntryThread] = useState(null)
  const openerRef = useRef(null)
  const seenRef = useRef(false)

  const reset = useCallback(() => {
    setOpenThreadHandle(null)
    setEntryThread(null)
    openerRef.current = null
  }, [])

  // Only a user-initiated close hands focus back, a popover that closes itself must not pull it away from where the user is.
  const closeThread = useCallback(() => {
    openerRef.current?.focus()
    reset()
  }, [reset])

  // A thread opened from the panel seeks first, so the mark takes a render or two to arrive. Only a mark that
  // was in view and then left (another page, playback past a span) closes its popover, otherwise it would
  // come back on its own when the view returns.
  const openThreadPlaced = !!openThreadHandle && previousThreads.some((t) => t.handle === openThreadHandle)
  useEffect(() => {
    if (!openThreadHandle) {
      seenRef.current = false
    } else if (openThreadPlaced) {
      seenRef.current = true
    } else if (seenRef.current) {
      seenRef.current = false
      reset()
    }
  }, [openThreadHandle, openThreadPlaced, reset])

  const openCanvasThread = useCallback((handle) => {
    setEntryThread(null)
    openerRef.current = null
    setOpenThreadHandle(handle)
  }, [])

  // Hiding the layer closes the open thread too, so showing it again does not bring the popover back.
  const togglePrevious = useCallback(() => {
    setShowPrevious((prev) => !prev)
    reset()
  }, [reset])

  const showThread = useCallback((thread, opener) => {
    seekTo(thread.annotation)
    setShowPrevious(true)
    setEntryThread(null)
    openerRef.current = opener
    setOpenThreadHandle(thread.handle)
  }, [seekTo])

  const showEntryThread = useCallback((thread, anchorPoint, opener) => {
    setOpenThreadHandle(null)
    openerRef.current = opener
    setEntryThread({ thread, anchorPoint })
  }, [])

  // A tick on the timeline is a thread's only entry on a video: with a mark the canvas shows it, a general comment hangs off the tick.
  const showTimelineThread = useCallback((thread, opener) => {
    if (hasMark(thread)) { return showThread(thread, opener) }
    seekTo(thread.annotation)
    const rect = opener.getBoundingClientRect()
    showEntryThread(thread, { x: rect.left + rect.width / 2, y: rect.top }, opener)
  }, [showThread, showEntryThread, seekTo])

  return {
    showPrevious, openThreadHandle, entryThread,
    openCanvasThread, showThread, showEntryThread, showTimelineThread, togglePrevious, closeThread
  }
}
