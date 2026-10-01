import { describePosition, findNearbyAnnotationNumbers } from './geometry.js'
import { annotationLabel } from './feedback.js'
import { annotationHandle } from '../core/annotationHandle.js'
import { formatTimecode, isTimed } from './timeline.js'

function timeLabel(annotation) {
  return typeof annotation.endTime === 'number'
    ? `from ${formatTimecode(annotation.time)} to ${formatTimecode(annotation.endTime)}`
    : `at ${formatTimecode(annotation.time)}`
}

/**
 * Nearby markers only count within one frame: two boxes in the same corner
 * at different times are never confused, since each sits on its own image.
 */
function nearbyNumbersByAnnotation(plan, media) {
  const result = new Map()
  for (const frame of plan.frames) {
    const placed = frame.entries.filter((e) => e.annotation.type !== 'comment')
    const nearby = findNearbyAnnotationNumbers(placed.map((e) => e.annotation), media.width, media.height)
    placed.forEach((entry, i) => {
      // A span also appears on later frames it covers; its own heading only
      // describes the frame it was drawn on.
      if (entry.annotation.time !== frame.time) { return }
      result.set(entry.annotation, nearby[i].map((localNumber) => placed[localNumber - 1].number))
    })
  }
  return result
}

function heading(annotation, media, nearby) {
  if (!isTimed(annotation)) { return 'General comment about the whole recording' }
  if (annotation.type === 'comment') {
    return `${timeLabel(annotation)}, ${typeof annotation.endTime === 'number' ? 'Span comment' : 'Comment'}`
  }
  const position = describePosition(annotation, media.width, media.height)
  const nearbyNote = nearby.length > 0
    ? ` — close to annotation${nearby.length > 1 ? 's' : ''} ${nearby.join(', ')}, check the numbered marker in the frame`
    : ''
  return `${timeLabel(annotation)}, ${annotationLabel(annotation)}: ${position}${nearbyNote}`
}

function formatEntries({ ordered, plan, media, files }) {
  const nearbyByAnnotation = nearbyNumbersByAnnotation(plan, media)
  return ordered.map((annotation, index) => {
    const number = index + 1
    const handle = annotationHandle(annotation.id)
    const marker = handle ? `${number}. [#${handle}]` : `${number}.`
    const lines = [`### ${marker} ${heading(annotation, media, nearbyByAnnotation.get(annotation) ?? [])}`]
    if (isTimed(annotation)) { lines.push(`Frame: ${files.frames.get(annotation.time)}`) }
    if (files.strips.has(number)) { lines.push(`Strip: ${files.strips.get(number)}`) }
    // A bare \r would otherwise end the quote and let text pass as a heading.
    lines.push(annotation.text ? `> ${annotation.text.replace(/\r\n?|\n/g, '\n> ')}` : '> (no comment text)')
    return lines.join('\n') + '\n'
  }).join('\n')
}

function formatPaths(files) {
  return `Frames: ${files.dir}\nOverview: ${files.overview}\n`
}

/**
 * Feedback on a recording. Agents cannot watch video, so every timed note
 * points at the still frame it was drawn on (markup baked in), a span also
 * at a strip of frames across it, and the overview shows the whole flow.
 */
export function exportVideoFeedback(context) {
  const { ordered, media } = context
  const count = ordered.length
  return `${count} annotation${count === 1 ? '' : 's'} on the recording ${media.label} ` +
    `(${formatTimecode(media.duration)}, ${media.width}x${media.height}).\n\n` +
    formatPaths(context.files) +
    'Each annotation points to the frame it was drawn on. Read the frame, then match the note to the visible element. ' +
    'A span also has a strip of frames across it.\n\n' +
    formatEntries(context)
}

export function formatVideoApprovalWithNotes(context) {
  const count = context.ordered.length
  return `APPROVED WITH NOTES: ${count} note${count === 1 ? '' : 's'}. ` +
    'The recording is approved as-is. Treat the notes below as context, not as change requests.\n\n' +
    formatPaths(context.files) + '\n' +
    formatEntries(context) + '\n'
}
