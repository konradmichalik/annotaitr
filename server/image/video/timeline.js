import { normalizeNotes } from '../../core/notes.js'

/**
 * Pure time-axis helpers for annotating a video or GIF: timecode formatting,
 * annotation ordering and the plan of which frames the client has to grab.
 * client/image/src/video/timeline.js mirrors the ordering and formatting
 * (client and server share no modules, so the duplication is deliberate).
 */

export const STRIP_FRAME_COUNT = 6
export const OVERVIEW_FRAME_COUNT = 12
export const MAX_FRAMES = 50

function splitTime(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  return {
    hours: Math.floor(totalMs / 3_600_000),
    minutes: Math.floor(totalMs / 60_000) % 60,
    secs: Math.floor(totalMs / 1000) % 60,
    ms: totalMs % 1000
  }
}

const pad = (value, length = 2) => String(value).padStart(length, '0')

export function formatTimecode(seconds) {
  const { hours, minutes, secs, ms } = splitTime(seconds)
  const rest = `${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`
  return hours > 0 ? `${hours}:${rest}` : rest
}

export function formatFileTime(seconds) {
  const { hours, minutes, secs, ms } = splitTime(seconds)
  const rest = `${pad(minutes)}m${pad(secs)}.${pad(ms, 3)}s`
  return hours > 0 ? `${hours}h${rest}` : rest
}

export function isTimed(annotation) {
  return typeof annotation.time === 'number'
}

/**
 * The order annotations are numbered in: timed ones by time (stable for
 * equal times), general comments about the whole recording last.
 */
export function orderVideoAnnotations(annotations) {
  const timed = annotations.filter(isTimed).sort((a, b) => a.time - b.time)
  const untimed = annotations.filter((a) => !isTimed(a))
  // Notes from before numbers were stored are numbered in time order, as they used to be.
  return normalizeNotes([...timed, ...untimed])
}

function isValidTime(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** The first problem with the annotations' time fields, or null when they are all valid. */
export function validateVideoAnnotations(annotations) {
  for (const [index, annotation] of annotations.entries()) {
    const label = `Annotation ${index + 1}`
    const hasTime = annotation.time !== undefined && annotation.time !== null
    if (annotation.type !== 'comment' && !hasTime) {
      return `${label}: a drawn annotation needs a time`
    }
    if (hasTime && !isValidTime(annotation.time)) {
      return `${label}: time must be a finite number >= 0`
    }
    if (annotation.endTime !== undefined && annotation.endTime !== null) {
      if (!hasTime || !isValidTime(annotation.endTime) || annotation.endTime <= annotation.time) {
        return `${label}: endTime needs a time and must be after it`
      }
    }
  }
  return null
}

const roundMs = (value) => Math.round(value * 1000) / 1000

function spreadTimes(start, end, count) {
  return Array.from({ length: count }, (_, k) => {
    if (k === 0) { return start }
    if (k === count - 1) { return end }
    return roundMs(start + (k * (end - start)) / (count - 1))
  })
}

function overviewTileOf(time, duration) {
  return Math.min(OVERVIEW_FRAME_COUNT - 1, Math.max(0, Math.floor((time / duration) * OVERVIEW_FRAME_COUNT)))
}

/**
 * Which frames feed the output: one per distinct annotation time, a strip
 * per span and an overview across the whole recording. `ordered` comes
 * from orderVideoAnnotations(), which gives every note its number.
 */
export function planFrames(ordered, duration) {
  const entries = ordered.map((annotation, index) => ({ annotation, number: annotation.number ?? index + 1 })).filter((e) => isTimed(e.annotation))

  const byTime = new Map()
  for (const entry of entries) {
    const list = byTime.get(entry.annotation.time)
    if (list) { list.push(entry) } else { byTime.set(entry.annotation.time, [entry]) }
  }
  // The annotator keeps a span's drawing visible across its whole span, so
  // a later frame inside it shows that drawing too and the image has to match.
  const drawnSpans = entries.filter((e) => e.annotation.type !== 'comment' && typeof e.annotation.endTime === 'number')
  const frames = [...byTime].map(([time, own]) => {
    const covering = drawnSpans.filter((e) => e.annotation.time < time && e.annotation.endTime >= time)
    return { time, entries: [...covering, ...own].sort((x, y) => x.number - y.number) }
  })

  const strips = entries
    .filter((e) => typeof e.annotation.endTime === 'number')
    .map((e) => ({ ...e, times: spreadTimes(e.annotation.time, e.annotation.endTime, STRIP_FRAME_COUNT) }))

  const overviewTimes = duration > 0
    ? Array.from({ length: OVERVIEW_FRAME_COUNT }, (_, i) => roundMs(((i + 0.5) * duration) / OVERVIEW_FRAME_COUNT))
    : []
  const numbersByTile = overviewTimes.map(() => [])
  if (duration > 0) {
    entries.forEach((e) => numbersByTile[overviewTileOf(e.annotation.time, duration)].push(e.number))
  }

  const times = [...new Set([
    ...frames.map((f) => f.time),
    ...strips.flatMap((s) => s.times),
    ...(ordered.length > 0 ? overviewTimes : [])
  ])].sort((a, b) => a - b)

  return { frames, strips, overview: { times: overviewTimes, numbersByTile }, times }
}
