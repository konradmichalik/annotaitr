import { useCallback, useRef, useState } from 'react'
import { formatTimecode } from './timeline.js'
import { PLAYER_ICONS } from '../utils/icons.jsx'
import SpanControls from './SpanControls.jsx'
import TimelineLanes from './TimelineLanes.jsx'

const RATES = [1, 0.5, 0.25]
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

/**
 * The player docked below the canvas: the Notes and Spans lanes and the
 * scrubber on top, transport and span controls below. The track is the
 * slider; markers sit in their own lanes, since interactive children inside
 * a slider would be unreachable for assistive technology.
 */
export default function Timeline({
  controller, playerState, markers, range, onMarkStart, onMarkEnd, onClearRange, onCommentRange, onChangeMarkerTimes,
  activeTool, onPickTool, previousThreads = [], previousRound = null, onShowThread
}) {
  const trackRef = useRef(null)
  const [hover, setHover] = useState(null)
  const { duration } = controller
  const { currentTime, playing, rate, hasAudio, muted, volume } = playerState

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
        <TimelineLanes
          controller={controller} currentTime={currentTime} markers={markers} onChangeTimes={onChangeMarkerTimes}
          previousThreads={previousThreads} previousRound={previousRound} onShowThread={onShowThread}
        >
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
        </TimelineLanes>
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
