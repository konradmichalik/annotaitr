import { useEffect, useRef, useState } from 'react'
import { layoutMarkerLanes, MARKER_SIZE_PX } from '../video/timeline.js'
import { statusDisplay } from './threadView.js'

const LANE_GAP_PX = 2

const percent = (time, duration) => `${Math.min(100, Math.max(0, (time / duration) * 100))}%`

/** Last round's marks as a read-only row of ticks above the current markers. Activating one seeks there and opens its thread. */
export default function PreviousTimelineMarks({ threads, round, duration, onShow }) {
  const rowRef = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(rowRef.current)
    return () => observer.disconnect()
  }, [])

  const { lanes, laneCount } = layoutMarkerLanes(threads.map((t) => ({ id: t.handle, time: t.annotation.time })), duration, width)

  return (
    <div ref={rowRef} className="timeline-markers timeline-markers--previous" style={{ height: laneCount * (MARKER_SIZE_PX + LANE_GAP_PX) }}>
      {threads.map((thread) => {
        const { icon, label } = statusDisplay(thread)
        const name = `Round ${round} mark ${thread.number}, ${label}`
        return (
          <button
            key={thread.handle}
            type="button"
            className={`timeline-marker timeline-marker--previous timeline-marker--${thread.anchor}`}
            style={{ top: (lanes.get(thread.handle) ?? 0) * (MARKER_SIZE_PX + LANE_GAP_PX), left: percent(thread.annotation.time, duration) }}
            aria-label={name}
            title={`${name}: ${thread.annotation.text ?? ''}`}
            onClick={(event) => onShow(thread, event.currentTarget)}
          >
            <span aria-hidden="true">{icon}</span> {thread.number}
          </button>
        )
      })}
    </div>
  )
}
