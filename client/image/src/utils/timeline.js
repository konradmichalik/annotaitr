/**
 * Time-axis helpers for annotating a video or GIF. formatTimecode and
 * orderVideoAnnotations mirror server/image/video/timeline.js (client and server
 * share no modules, so the duplication is deliberate): the numbers shown
 * here must match the numbers in the agent's feedback.
 */

const pad = (value, length = 2) => String(value).padStart(length, '0')

export function formatTimecode(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(totalMs / 3_600_000)
  const rest = `${pad(Math.floor(totalMs / 60_000) % 60)}:${pad(Math.floor(totalMs / 1000) % 60)}.${pad(totalMs % 1000, 3)}`
  return hours > 0 ? `${hours}:${rest}` : rest
}

export function isTimed(annotation) {
  return typeof annotation.time === 'number'
}

export function isSpan(annotation) {
  return typeof annotation.endTime === 'number'
}

/**
 * What an annotation's time fields pin it to, as text: `at` precedes a
 * moment, `from` and `to` frame a span. Null for something without a time.
 */
export function formatTimes(times, { at = '', from = '', to = ' to ' } = {}) {
  if (!times || !isTimed(times)) { return null }
  return isSpan(times)
    ? `${from}${formatTimecode(times.time)}${to}${formatTimecode(times.endTime)}`
    : `${at}${formatTimecode(times.time)}`
}

export function orderVideoAnnotations(annotations) {
  const timed = annotations.filter(isTimed).sort((a, b) => a.time - b.time)
  return [...timed, ...annotations.filter((a) => !isTimed(a))]
}

/**
 * Whether a drawn annotation belongs on the frame shown at `time`. A point
 * annotation sits on exactly one frame, `halfFrame` absorbs the rounding of
 * the reported playback position. A span stays visible across its span.
 */
export function isVisibleAt(annotation, time, halfFrame) {
  if (annotation.type === 'comment' || !isTimed(annotation)) { return false }
  const end = isSpan(annotation) ? annotation.endTime : annotation.time
  return time >= annotation.time - halfFrame && time <= end + halfFrame
}

export const MARKER_SIZE_PX = 20
const MARKER_GAP_PX = 4

/**
 * Put timeline markers on as few rows as possible without any two touching:
 * a point marker is a badge centred on its time, a span a bar from start to
 * end that is never narrower than its number badge.
 */
export function layoutMarkerLanes(markers, duration, trackWidth) {
  const toPx = (time) => (time / duration) * trackWidth
  const extents = markers.map((marker) => {
    if (!isSpan(marker)) {
      const center = toPx(marker.time)
      return { id: marker.id, start: center - MARKER_SIZE_PX / 2, end: center + MARKER_SIZE_PX / 2 }
    }
    const start = toPx(marker.time)
    return { id: marker.id, start, end: Math.max(toPx(marker.endTime), start + MARKER_SIZE_PX) }
  }).sort((a, b) => a.start - b.start)

  const laneEnds = []
  const lanes = new Map()
  for (const extent of extents) {
    const free = laneEnds.findIndex((end) => end + MARKER_GAP_PX <= extent.start)
    const lane = free === -1 ? laneEnds.length : free
    laneEnds[lane] = extent.end
    lanes.set(extent.id, lane)
  }
  return { lanes, laneCount: Math.max(1, laneEnds.length) }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const roundMs = (value) => Math.round(value * 1000) / 1000

/**
 * The times of a marker dragged by `delta` seconds. `mode` is 'move' (the
 * whole marker), 'start' or 'end' (one edge of a span). Dragging a point's
 * 'end' to the right turns it into a span. A span never gets
 * shorter than `minSpan`, nothing leaves 0..duration, and `snap` puts each
 * time on a frame the player can show (a GIF frame's start).
 *
 * Snapping can still pull a span's end back onto its start, e.g. on a GIF
 * frame held longer than `minSpan`. Such a result keeps the previous times,
 * since a span that ends where it starts is not a span the server accepts.
 */
export function dragMarkerTimes(times, mode, delta, options) {
  const next = draggedTimes(times, mode, delta, options)
  return isSpan(next) && next.endTime <= next.time ? { ...times } : next
}

function draggedTimes(times, mode, delta, { duration, minSpan, snap = (t) => t }) {
  const fix = (t) => roundMs(snap(t))
  if (!isSpan(times)) {
    if (mode !== 'end') { return { time: fix(clamp(times.time + delta, 0, duration)) } }
    if (delta <= 0) { return { time: times.time } }
    return { time: times.time, endTime: fix(clamp(times.time + delta, times.time + minSpan, duration)) }
  }
  const length = times.endTime - times.time
  if (mode === 'start') {
    return { time: fix(clamp(times.time + delta, 0, times.endTime - minSpan)), endTime: times.endTime }
  }
  if (mode === 'end') {
    return { time: times.time, endTime: fix(clamp(times.endTime + delta, times.time + minSpan, duration)) }
  }
  const time = clamp(times.time + delta, 0, duration - length)
  return { time: fix(time), endTime: fix(time + length) }
}
