import { useCallback, useEffect, useRef, useState } from 'react'
import { formatTimecode, formatTimes, isSpan, layoutMarkerLanes, dragMarkerTimes, MARKER_SIZE_PX } from '../utils/timeline.js'
import { TOOL_ICONS, ACTION_ICONS, PLAYER_ICONS } from '../utils/icons.jsx'
import SpanControls from './SpanControls.jsx'

const RATES = [1, 0.5, 0.25]
const LANE_GAP_PX = 2
const PAGE_STEP_SECONDS = 5

const percent = (time, duration) => `${Math.min(100, Math.max(0, (time / duration) * 100))}%`

/** Mute toggle plus a volume slider that pops up above it; only shown for a video, a GIF has no sound. */
function VolumeControl({ controller, muted, volume }) {
  const silent = muted || volume === 0
  return (
    <div className="timeline-volume">
      <button
        type="button"
        className="timeline-icon-btn"
        onClick={() => controller.setMuted(!muted)}
        aria-label={silent ? 'Unmute' : 'Mute'}
        title={silent ? 'Unmute (M)' : 'Mute (M)'}
      >
        {silent ? PLAYER_ICONS.muted : PLAYER_ICONS.sound}
      </button>
      <div className="timeline-volume-popup">
        <div className="timeline-volume-card">
          <input
            type="range"
            className="timeline-volume-slider"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={(event) => controller.setVolume(Number(event.target.value))}
            aria-label="Volume"
            aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`}
            style={{ '--volume': `${(muted ? 0 : volume) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}

/** One button that cycles the speed, the way video players do it, to keep the row short. */
function RateSwitch({ rate, onChange }) {
  const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]
  return (
    <button
      type="button"
      className="timeline-rate"
      onClick={() => onChange(next)}
      aria-label={`Playback speed ${rate}×, switch to ${next}×`}
      title={`Playback speed: ${RATES.map((value) => `${value}×`).join(', ')}`}
    >
      {rate}×
    </button>
  )
}

const DRAG_THRESHOLD_PX = 3

const TYPE_LABELS = { box: 'Box', arrow: 'Arrow', freehand: 'Freehand', highlighter: 'Highlight', pin: 'Pin' }

function typeLabel(marker) {
  if (marker.type !== 'comment') { return TYPE_LABELS[marker.type] ?? marker.type }
  return isSpan(marker) ? 'Span comment' : 'Comment'
}

function markerLabel(marker) {
  return `Annotation ${marker.number} ${formatTimes(marker, { at: 'at ', from: 'from ' })}, ${typeLabel(marker)}`
}

/** A span bar has room to say what it holds: a drawing (its tool) or only text. */
function SpanMarkerContent({ marker }) {
  // Clipped on its own, so the resize edges can still reach past the bar.
  return (
    <span className="timeline-marker-content">
      <span className="timeline-marker-number">{marker.number}</span>
      <span className="timeline-marker-icon" aria-hidden="true">
        {marker.type === 'comment' ? ACTION_ICONS.comment : TOOL_ICONS[marker.type]}
      </span>
      {marker.text && <span className="timeline-marker-text">{marker.text}</span>}
    </span>
  )
}

/**
 * Markers seek on click and change their annotation's time on drag: a point
 * or a whole span by its body, a span's start or end by its edge. The player
 * follows the drag, so the frame the drawing will sit on stays in view.
 */
function Markers({ markers, controller, frameDuration, onSelect, onChangeTimes, rowRef }) {
  const [width, setWidth] = useState(0)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const { duration } = controller

  // Overlap is a question of pixels, not seconds, so the lanes follow the
  // rendered width of the marker row.
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(rowRef.current)
    return () => observer.disconnect()
  }, [rowRef])

  const { lanes, laneCount } = layoutMarkerLanes(markers, duration, width)
  const dragOptions = { duration, minSpan: frameDuration, snap: controller.snap }

  const timesAfter = (marker, mode, delta) => dragMarkerTimes(
    { time: marker.time, endTime: marker.endTime }, mode, delta, dragOptions
  )

  const showFrameOf = (times, mode) => controller.seek(mode === 'end' ? times.endTime : times.time)

  const handlePointerDown = (event, marker) => {
    if (event.button !== 0) { return }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { marker, mode: event.target.dataset.edge ?? 'move', startX: event.clientX, moved: false, times: null }
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || width === 0) { return }
    const dx = event.clientX - drag.startX
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) { return }
    drag.moved = true
    drag.times = timesAfter(drag.marker, drag.mode, (dx / width) * duration)
    onChangeTimes(drag.marker.id, drag.times, 'preview')
    showFrameOf(drag.times, drag.mode)
  }

  const handlePointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.moved && drag.times) {
      suppressClickRef.current = true
      onChangeTimes(drag.marker.id, drag.times, 'commit')
    }
  }

  // Alt+arrows move a marker by one frame, with Shift its span's end.
  const handleKeyDown = (event, marker) => {
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) { return }
    event.preventDefault()
    const mode = event.shiftKey ? 'end' : 'move'
    const times = timesAfter(marker, mode, (event.key === 'ArrowLeft' ? -1 : 1) * frameDuration)
    onChangeTimes(marker.id, times, 'commit')
    showFrameOf(times, mode)
  }

  const handleClick = (marker) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onSelect(marker.time)
  }

  return (
    <div
      ref={rowRef}
      className="timeline-markers"
      style={{ height: markers.length > 0 ? laneCount * (MARKER_SIZE_PX + LANE_GAP_PX) : 0 }}
    >
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          className={`timeline-marker${isSpan(marker) ? ' timeline-marker--span' : ''}`}
          style={{
            top: (lanes.get(marker.id) ?? 0) * (MARKER_SIZE_PX + LANE_GAP_PX),
            left: percent(marker.time, duration),
            width: isSpan(marker) ? `calc(${percent(marker.endTime, duration)} - ${percent(marker.time, duration)})` : undefined,
            '--marker-color': marker.color
          }}
          onPointerDown={(event) => handlePointerDown(event, marker)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { dragRef.current = null }}
          onKeyDown={(event) => handleKeyDown(event, marker)}
          onClick={() => handleClick(marker)}
          aria-label={markerLabel(marker)}
          title={`${markerLabel(marker)}${marker.text ? `: ${marker.text}` : ''}\n${isSpan(marker)
            ? 'Drag to move, drag an edge to resize. Alt+arrows: one frame, with Shift the end.'
            : 'Drag to move, drag the right handle out to make it a span. Alt+arrows: one frame, Alt+Shift+→: make it a span.'}`}
        >
          {isSpan(marker) && <span className="timeline-marker-edge timeline-marker-edge--start" data-edge="start" aria-hidden="true" />}
          {isSpan(marker) ? <SpanMarkerContent marker={marker} /> : marker.number}
          <span className="timeline-marker-edge timeline-marker-edge--end" data-edge="end" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

/**
 * The player docked below the canvas: annotation markers and the scrubber on
 * top, transport and span controls below. The track is the slider; markers
 * sit in their own row, since interactive children inside a slider would be
 * unreachable for assistive technology.
 */
export default function Timeline({
  controller, playerState, markers, range, onMarkStart, onMarkEnd, onClearRange, onCommentRange, onChangeMarkerTimes,
  activeTool, onPickTool
}) {
  const trackRef = useRef(null)
  const markersRef = useRef(null)
  const [hover, setHover] = useState(null)
  const { duration } = controller
  const { currentTime, playing, rate, frameDuration, hasAudio, muted, volume } = playerState

  const timeAtPointer = useCallback((event) => {
    const rect = trackRef.current.getBoundingClientRect()
    return Math.min(duration, Math.max(0, ((event.clientX - rect.left) / rect.width) * duration))
  }, [duration])

  const handlePointerDown = (event) => {
    trackRef.current.setPointerCapture(event.pointerId)
    controller.seek(timeAtPointer(event))
  }

  const handlePointerMove = (event) => {
    const time = timeAtPointer(event)
    setHover(time)
    if (trackRef.current.hasPointerCapture(event.pointerId)) { controller.seek(time) }
  }

  const handleTrackKeyDown = (event) => {
    const keys = {
      Home: 0,
      End: duration,
      PageUp: currentTime + PAGE_STEP_SECONDS,
      PageDown: currentTime - PAGE_STEP_SECONDS
    }
    if (!(event.key in keys)) { return }
    event.preventDefault()
    controller.seek(keys[event.key])
  }

  const rangeBar = range.start !== null && range.end !== null
    ? { left: percent(range.start, duration), width: `calc(${percent(range.end, duration)} - ${percent(range.start, duration)})` }
    : null

  return (
    <div className="timeline">
      <div className="timeline-scrubber">
        <Markers
          markers={markers} controller={controller} frameDuration={frameDuration}
          onSelect={controller.seek} onChangeTimes={onChangeMarkerTimes} rowRef={markersRef}
        />
        <div
          ref={trackRef}
          className="timeline-track"
          role="slider"
          tabIndex={0}
          aria-label="Playback position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration * 10) / 10}
          aria-valuenow={Math.round(currentTime * 10) / 10}
          aria-valuetext={formatTimecode(currentTime)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={handleTrackKeyDown}
        >
          <div className="timeline-rail">
            <div className="timeline-progress" style={{ width: percent(currentTime, duration) }} />
            {range.start !== null && range.end === null && (
              <div className="timeline-range-start" style={{ left: percent(range.start, duration) }} />
            )}
            {rangeBar && <div className="timeline-range" style={rangeBar} />}
          </div>
          <div className="timeline-knob" style={{ left: percent(currentTime, duration) }} />
          {hover !== null && (
            <div className="timeline-hover" style={{ left: percent(hover, duration) }} aria-hidden="true">
              {formatTimecode(hover)}
            </div>
          )}
        </div>
      </div>

      <div className="timeline-controls">
        <div className="timeline-transport">
          <button type="button" className="timeline-icon-btn" onClick={() => controller.step(-1)} aria-label="Previous frame" title="Previous frame (←, Shift: 1 s)">
            {PLAYER_ICONS.previousFrame}
          </button>
          <button type="button" className="timeline-play" onClick={() => controller.togglePlay()} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
            {playing ? PLAYER_ICONS.pause : PLAYER_ICONS.play}
          </button>
          <button type="button" className="timeline-icon-btn" onClick={() => controller.step(1)} aria-label="Next frame" title="Next frame (→, Shift: 1 s)">
            {PLAYER_ICONS.nextFrame}
          </button>
        </div>
        <span className="timeline-time">
          <span className="timeline-time-current">{formatTimecode(currentTime)}</span>
          <span className="timeline-time-total"> / {formatTimecode(duration)}</span>
        </span>
        <RateSwitch rate={rate} onChange={(value) => controller.setRate(value)} />
        {hasAudio && <VolumeControl controller={controller} muted={muted} volume={volume} />}
        <SpanControls range={range} currentTime={currentTime} activeTool={activeTool} onPickTool={onPickTool} onMarkStart={onMarkStart} onMarkEnd={onMarkEnd} onClearRange={onClearRange} onCommentRange={onCommentRange} />
      </div>
    </div>
  )
}
