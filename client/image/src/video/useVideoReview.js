import { useCallback, useMemo, useState } from 'react'
import { orderVideoAnnotations, isVisibleAt, isTimed, isSpan } from './timeline.js'

const EMPTY_RANGE = { start: null, end: null }
const FALLBACK_FRAME_DURATION = 1 / 30

/**
 * Everything the annotation UI needs to know about time on a recording:
 * the order of the notes in time, which annotations belong on the frame shown,
 * the timeline markers, the span being marked, and the time stamped onto
 * a new annotation. With no controller (a still image) it passes the
 * annotations through untouched.
 */
export function useVideoReview({ controller, playerState, annotations }) {
  const [range, setRange] = useState(EMPTY_RANGE)
  const currentTime = playerState?.currentTime ?? 0
  const halfFrame = (playerState?.frameDuration ?? FALLBACK_FRAME_DURATION) / 2

  const ordered = useMemo(
    () => (controller ? orderVideoAnnotations(annotations) : annotations),
    [controller, annotations]
  )

  const visible = controller ? ordered.filter((a) => isVisibleAt(a, currentTime, halfFrame)) : annotations

  const markers = useMemo(() => ordered.filter(isTimed).map((a) => ({
    id: a.id,
    number: a.number,
    intent: a.intent,
    type: a.type,
    text: a.text,
    time: a.time,
    endTime: isSpan(a) ? a.endTime : undefined
  })), [ordered])

  const markStart = useCallback(() => {
    const time = controller.getState().currentTime
    setRange((prev) => ({ start: time, end: prev.end !== null && prev.end > time ? prev.end : null }))
  }, [controller])

  // Once a span is complete the player returns to its start, because that
  // is the frame a drawing on the span belongs to.
  const markEnd = useCallback(() => {
    const time = controller.getState().currentTime
    if (range.start === null || time <= range.start) { return }
    setRange({ start: range.start, end: time })
    controller.seek(range.start)
  }, [controller, range.start])

  const clearRange = useCallback(() => setRange(EMPTY_RANGE), [])

  const spanComplete = range.start !== null && range.end !== null
  const [drawTimes, setDrawTimes] = useState(null)

  /**
   * Called on pointer down over the canvas, i.e. when a drawing starts. The
   * time is fixed here and not when the comment is saved, because the
   * playhead can still move while the comment popover is open. A marked
   * span only applies while the player is still on its start frame.
   */
  const captureTimes = useCallback(() => {
    if (!controller) { return }
    const { currentTime: now, frameDuration } = controller.getState()
    const onSpanStart = spanComplete && Math.abs(now - range.start) <= frameDuration / 2
    setDrawTimes(onSpanStart ? { time: range.start, endTime: range.end } : { time: now })
  }, [controller, spanComplete, range])

  /** The time fields for the annotation being added, consuming the span it used. */
  const takeTimes = useCallback(() => {
    if (!controller) { return {} }
    const times = drawTimes ?? { time: controller.getState().currentTime }
    if (times.endTime !== undefined) { setRange(EMPTY_RANGE) }
    setDrawTimes(null)
    return times
  }, [controller, drawTimes])

  const seekTo = useCallback((annotation) => {
    if (!controller || !isTimed(annotation)) { return }
    controller.seek(annotation.time)
  }, [controller])

  return {
    ordered, visible, markers, range, spanComplete, drawTimes,
    markStart, markEnd, clearRange, captureTimes, takeTimes, seekTo
  }
}
