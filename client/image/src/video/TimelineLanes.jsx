import { useEffect, useId, useRef, useState } from 'react'
import { formatTimecode, formatTimes, isSpan, layoutMarkerLanes, clusterNotes, dragMarkerTimes, MARKER_SIZE_PX } from './timeline.js'
import { TOOL_ICONS, ACTION_ICONS } from '../utils/icons.jsx'
import { PreviousMark, previousMarkName } from '../threads/PreviousTimelineMarks.jsx'
import { threadNumber } from '../threads/threadView.js'
import { intentMark, intentOnMark } from '../utils/annotationColors.js'
import { intentWord } from '../../../shared/utils/intents.js'
import { useRovingFocus } from '../../../shared/hooks/useRovingFocus.js'

const ROW_GAP_PX = 2
const DRAG_THRESHOLD_PX = 3
const TYPE_LABELS = { box: 'Box', element: 'Element', arrow: 'Arrow', freehand: 'Freehand', highlighter: 'Highlight', pin: 'Pin' }

const percent = (time, duration) => `${Math.min(100, Math.max(0, (time / duration) * 100))}%`

function typeLabel(marker) {
  if (marker.type !== 'comment') { return TYPE_LABELS[marker.type] ?? marker.type }
  return isSpan(marker) ? 'Span comment' : 'Comment'
}

function markerLabel(marker) {
  return `Annotation ${marker.number} ${formatTimes(marker, { at: 'at ', from: 'from ' })}, ${typeLabel(marker)}`
}

const markerColors = (intent) => ({ '--marker-color': intentMark(intent), '--marker-on-color': intentOnMark(intent) })

/** The rendered width of the lanes: overlap and clusters are a question of pixels, not seconds. */
function useWidth(ref) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/**
 * Markers seek on click and change their annotation's time on drag: a point
 * or a whole span by its body, a span's start or end by its edge. The player
 * follows the drag, so the frame the drawing will sit on stays in view.
 */
function useMarkerDrag({ controller, width, onChangeTimes, onDragging }) {
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const { duration } = controller
  // One frame of the marker's own start, not of the frame on screen: GIF
  // frames differ in length, and the shortest span ends on the next frame.
  const ownFrame = (marker) => controller.frameDurationAt(marker.time)
  const timesAfter = (marker, mode, delta) => dragMarkerTimes(
    { time: marker.time, endTime: marker.endTime }, mode, delta,
    { duration, minSpan: ownFrame(marker), snap: controller.snap }
  )
  const showFrameOf = (times, mode) => controller.seek(mode === 'end' ? times.endTime : times.time)

  return (marker) => ({
    onPointerDown: (event) => {
      if (event.button !== 0) { return }
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { marker, mode: event.target.dataset.edge ?? 'move', startX: event.clientX, moved: false, times: null }
      onDragging({ id: marker.id, span: isSpan(marker) })
    },
    onPointerMove: (event) => {
      const drag = dragRef.current
      if (!drag || width === 0) { return }
      const dx = event.clientX - drag.startX
      if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) { return }
      drag.moved = true
      drag.times = timesAfter(drag.marker, drag.mode, (dx / width) * duration)
      onChangeTimes(drag.marker.id, drag.times, 'preview')
      showFrameOf(drag.times, drag.mode)
    },
    onPointerUp: () => {
      const drag = dragRef.current
      dragRef.current = null
      onDragging(null)
      if (drag?.moved && drag.times) {
        suppressClickRef.current = true
        onChangeTimes(drag.marker.id, drag.times, 'commit')
      }
    },
    onPointerCancel: () => {
      dragRef.current = null
      onDragging(null)
    },
    // Alt+arrows move a marker by one frame, with Shift its span's end.
    onKeyDown: (event) => {
      if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) { return }
      event.preventDefault()
      const mode = event.shiftKey ? 'end' : 'move'
      const times = timesAfter(marker, mode, (event.key === 'ArrowLeft' ? -1 : 1) * ownFrame(marker))
      onChangeTimes(marker.id, times, 'commit')
      showFrameOf(times, mode)
    },
    onClick: () => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      controller.seek(marker.time)
    }
  })
}

/**
 * A note on its lane: a numbered badge for a moment, a bar for a span. One
 * component for both, so a point dragged into a span stays the same element
 * and keeps the pointer.
 */
function Marker({ marker, duration, row = 0, dragHandlers }) {
  const span = isSpan(marker)
  return (
    <button
      type="button"
      className={`timeline-marker${span ? ' timeline-marker--span' : ''}`}
      style={{
        top: row * (MARKER_SIZE_PX + ROW_GAP_PX),
        left: percent(marker.time, duration),
        width: span ? `calc(${percent(marker.endTime, duration)} - ${percent(marker.time, duration)})` : undefined,
        ...markerColors(marker.intent)
      }}
      {...dragHandlers(marker)}
      aria-label={markerLabel(marker)}
      title={`${markerLabel(marker)}${marker.text ? `: ${marker.text}` : ''}\n${span
        ? 'Drag to move, drag an edge to resize. Alt+arrows: one frame, with Shift the end.'
        : 'Drag to move, drag the right handle out to make it a span. Alt+arrows: one frame, Alt+Shift+→: make it a span.'}`}
    >
      {span && <span className="timeline-marker-edge timeline-marker-edge--start" data-edge="start" aria-hidden="true" />}
      {span ? (
        // Clipped on its own, so the resize edges can still reach past the bar.
        <span className="timeline-marker-content">
          <span className="timeline-marker-number">{marker.number}</span>
          <span className="timeline-marker-icon" aria-hidden="true">
            {marker.type === 'comment' ? ACTION_ICONS.comment : TOOL_ICONS[marker.type]}
          </span>
          {marker.text && <span className="timeline-marker-text">{marker.text}</span>}
        </span>
      ) : marker.number}
      <span className="timeline-marker-edge timeline-marker-edge--end" data-edge="end" aria-hidden="true" />
    </button>
  )
}

/** A row of the cluster list: number on the intent colour (dashed grey for an earlier round), intent and timecode. */
function ClusterItem({ item, round, onPick }) {
  const previous = item.kind === 'previous'
  const number = previous ? threadNumber(item.thread) : item.number
  const word = previous ? previousMarkName(item.thread, round).replace(/ mark \d+,/, ',') : intentWord(item.intent)
  return (
    <li>
      <button type="button" className="timeline-cluster-item" data-dock-item onClick={() => onPick(item)}>
        <span className={`timeline-cluster-number${previous ? ' timeline-cluster-number--previous' : ''}`} style={previous ? undefined : markerColors(item.intent)}>
          {number}
        </span>
        <span className="timeline-cluster-word">{word}</span>
        <span className="timeline-cluster-time">{formatTimecode(item.time)}</span>
      </button>
    </li>
  )
}

/**
 * Notes too close to tell apart: one chip with their colours and count. It
 * opens a list above the lanes (never over the transport below), whose rows
 * seek to the note or open an earlier-round thread.
 */
function Cluster({ cluster, duration, round, open, onToggle, onPick }) {
  const listId = useId()
  const chipRef = useRef(null)
  const roving = useRovingFocus()
  const colours = [...new Set(cluster.items.map((item) => (item.kind === 'previous' ? 'previous' : item.intent ?? 'change')))]
  const name = `${cluster.items.length} notes around ${formatTimecode(cluster.time)}`

  useEffect(() => {
    if (open) { roving.ref.current?.querySelector('[data-dock-item]')?.focus() }
  }, [open, roving.ref])

  const close = (refocus) => {
    onToggle(null)
    if (refocus) { chipRef.current?.focus() }
  }

  return (
    <div className="timeline-cluster" style={{ left: percent(cluster.time, duration) }}>
      <button
        ref={chipRef}
        type="button"
        className="timeline-marker timeline-marker--cluster"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={name}
        title={name}
        onClick={() => onToggle(open ? null : cluster.id)}
      >
        <span className="timeline-cluster-dots" aria-hidden="true">
          {colours.map((colour) => (
            <span
              key={colour}
              className={`timeline-cluster-dot${colour === 'previous' ? ' timeline-cluster-dot--previous' : ''}`}
              style={colour === 'previous' ? undefined : { background: intentMark(colour) }}
            />
          ))}
        </span>
        {cluster.items.length}
      </button>
      {open && (
        <div
          id={listId}
          ref={roving.ref}
          className="timeline-cluster-list"
          role="group"
          aria-label={name}
          onFocus={roving.onFocus}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close(true)
              return
            }
            roving.onKeyDown(event)
          }}
          onBlur={(event) => {
            if (!event.currentTarget.parentElement.contains(event.relatedTarget)) { close(false) }
          }}
        >
          <ul>
            {cluster.items.map((item) => (
              <ClusterItem key={item.id} item={item} round={round} onPick={(picked) => { close(true); onPick(picked, chipRef.current) }} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * The two lanes above the scrubber: `Notes` for point notes (earlier-round
 * marks among them, dashed grey) and `Spans` for ranges, one row per overlap.
 * Notes closer than a marker width merge into a cluster chip. A playhead line
 * runs across both lanes and the track below, which the caller renders as `children`.
 */
export default function TimelineLanes({ controller, currentTime, markers, onChangeTimes, previousThreads, previousRound, onShowThread, children }) {
  const notesRef = useRef(null)
  const width = useWidth(notesRef)
  const [openCluster, setOpenCluster] = useState(null)
  const { duration } = controller
  // A marker keeps its lane while it is dragged, even when a point grows into
  // a span: moving it to the other lane would remount it and end the drag.
  const [dragging, setDragging] = useState(null)
  const dragHandlers = useMarkerDrag({ controller, width, onChangeTimes, onDragging: setDragging })
  const inSpans = (marker) => (marker.id === dragging?.id ? dragging.span : isSpan(marker))

  const previousSpans = previousThreads.filter((thread) => isSpan(thread.annotation))
  const notes = [
    ...markers.filter((marker) => !inSpans(marker)).map((marker) => ({ ...marker, kind: 'note' })),
    ...previousThreads.filter((thread) => !isSpan(thread.annotation))
      .map((thread) => ({ id: `previous-${thread.handle}`, kind: 'previous', time: thread.annotation.time, thread }))
  ]
  const clusters = clusterNotes(notes, duration, width)
  const spans = markers.filter(inSpans)
  const spanItems = [...spans, ...previousSpans.map((thread) => ({ id: `previous-${thread.handle}`, time: thread.annotation.time, endTime: thread.annotation.endTime }))]
  const { lanes, laneCount } = layoutMarkerLanes(spanItems, duration, width)

  // A list whose notes moved apart (or were deleted) has nothing left to show.
  const shownCluster = clusters.find((cluster) => cluster.id === openCluster && cluster.items.length > 1) ? openCluster : null

  const pick = (item, anchor) => {
    if (item.kind === 'previous') { onShowThread(item.thread, anchor) } else { controller.seek(item.time) }
  }

  const renderNote = (cluster) => {
    if (cluster.items.length > 1) {
      return (
        <Cluster
          key={cluster.id} cluster={cluster} duration={duration} round={previousRound}
          open={shownCluster === cluster.id} onToggle={setOpenCluster} onPick={pick}
        />
      )
    }
    const [item] = cluster.items
    if (item.kind === 'previous') {
      return <PreviousMark key={item.id} thread={item.thread} round={previousRound} style={{ left: percent(item.time, duration) }} onShow={onShowThread} />
    }
    return <Marker key={item.id} marker={item} duration={duration} dragHandlers={dragHandlers} />
  }

  return (
    <div className="timeline-lanes">
      <span className="timeline-lane-label" aria-hidden="true">Notes</span>
      <div ref={notesRef} className="timeline-lane timeline-lane--notes" role="group" aria-label="Notes">
        {clusters.map(renderNote)}
      </div>
      <span className="timeline-lane-label" aria-hidden="true">Spans</span>
      <div className="timeline-lane timeline-lane--spans" role="group" aria-label="Spans" style={{ height: laneCount * (MARKER_SIZE_PX + ROW_GAP_PX) }}>
        {spans.map((marker) => (
          <Marker key={marker.id} marker={marker} duration={duration} row={lanes.get(marker.id) ?? 0} dragHandlers={dragHandlers} />
        ))}
        {previousSpans.map((thread) => (
          <PreviousMark
            key={thread.handle} thread={thread} round={previousRound} onShow={onShowThread}
            style={{
              top: (lanes.get(`previous-${thread.handle}`) ?? 0) * (MARKER_SIZE_PX + ROW_GAP_PX),
              left: percent(thread.annotation.time, duration),
              width: `calc(${percent(thread.annotation.endTime, duration)} - ${percent(thread.annotation.time, duration)})`,
              transform: 'none'
            }}
          />
        ))}
      </div>
      <span aria-hidden="true" />
      {children}
      <div className="timeline-playhead" style={{ left: percent(currentTime, duration) }} aria-hidden="true" />
    </div>
  )
}
