import { describe, it, expect } from 'vitest'
import { formatTimecode, orderVideoAnnotations, isVisibleAt, layoutMarkerLanes, dragMarkerTimes, formatTimes } from '../../../client/image/src/utils/timeline.js'

describe('formatTimecode', () => {
  it('matches the server format', () => {
    expect(formatTimecode(3.24)).toBe('00:03.240')
    expect(formatTimecode(3723.5)).toBe('1:02:03.500')
  })
})

describe('orderVideoAnnotations', () => {
  it('orders by time with untimed comments last', () => {
    const ordered = orderVideoAnnotations([
      { id: 'g', type: 'comment' }, { id: 'b', type: 'box', time: 2 }, { id: 'a', type: 'pin', time: 1 }
    ])
    expect(ordered.map((a) => a.id)).toEqual(['a', 'b', 'g'])
  })
})

describe('isVisibleAt', () => {
  const half = 0.02

  it('shows a point annotation only on its own frame', () => {
    const pin = { type: 'pin', time: 1 }
    expect(isVisibleAt(pin, 1, half)).toBe(true)
    expect(isVisibleAt(pin, 1.01, half)).toBe(true)
    expect(isVisibleAt(pin, 1.05, half)).toBe(false)
  })

  it('shows a span annotation throughout its span', () => {
    const box = { type: 'box', time: 1, endTime: 3 }
    expect(isVisibleAt(box, 2, half)).toBe(true)
    expect(isVisibleAt(box, 3.01, half)).toBe(true)
    expect(isVisibleAt(box, 3.5, half)).toBe(false)
    expect(isVisibleAt(box, 0.5, half)).toBe(false)
  })

  it('never shows comments on the canvas', () => {
    expect(isVisibleAt({ type: 'comment', time: 1 }, 1, half)).toBe(false)
  })
})

describe('layoutMarkerLanes', () => {
  const point = (id, time) => ({ id, time })
  const span = (id, time, endTime) => ({ id, time, endTime })

  it('keeps markers that do not touch on one lane', () => {
    const { lanes, laneCount } = layoutMarkerLanes([point('a', 1), point('b', 5), span('c', 7, 9)], 10, 1000)
    expect(laneCount).toBe(1)
    expect([...lanes.values()]).toEqual([0, 0, 0])
  })

  it('moves a span starting under a point marker to its own lane', () => {
    const { lanes, laneCount } = layoutMarkerLanes([point('a', 2), span('b', 2, 5)], 10, 1000)
    expect(laneCount).toBe(2)
    expect(lanes.get('a')).not.toBe(lanes.get('b'))
  })

  it('stacks overlapping spans and reuses a lane once it is free again', () => {
    const { lanes, laneCount } = layoutMarkerLanes([span('a', 0, 4), span('b', 2, 6), span('c', 5, 8)], 10, 1000)
    expect(laneCount).toBe(2)
    expect(lanes.get('c')).toBe(lanes.get('a'))
  })

  it('treats a very short span as wide as its number label', () => {
    const { laneCount } = layoutMarkerLanes([span('a', 1, 1.01), point('b', 1.1)], 10, 1000)
    expect(laneCount).toBe(2)
  })
})

describe('dragMarkerTimes', () => {
  const opts = { duration: 10, minSpan: 0.1 }

  it('moves a point and clamps it to the recording', () => {
    expect(dragMarkerTimes({ time: 2 }, 'move', 1.5, opts)).toEqual({ time: 3.5 })
    expect(dragMarkerTimes({ time: 2 }, 'move', -5, opts)).toEqual({ time: 0 })
    expect(dragMarkerTimes({ time: 2 }, 'move', 20, opts)).toEqual({ time: 10 })
  })

  it('moves a span keeping its length, also at the edges', () => {
    expect(dragMarkerTimes({ time: 2, endTime: 4 }, 'move', 1, opts)).toEqual({ time: 3, endTime: 5 })
    expect(dragMarkerTimes({ time: 2, endTime: 4 }, 'move', 9, opts)).toEqual({ time: 8, endTime: 10 })
    expect(dragMarkerTimes({ time: 2, endTime: 4 }, 'move', -9, opts)).toEqual({ time: 0, endTime: 2 })
  })

  it('resizes either end but never below the minimum span', () => {
    expect(dragMarkerTimes({ time: 2, endTime: 4 }, 'start', -1, opts)).toEqual({ time: 1, endTime: 4 })
    expect(dragMarkerTimes({ time: 2, endTime: 4 }, 'start', 5, opts)).toEqual({ time: 3.9, endTime: 4 })
    expect(dragMarkerTimes({ time: 2, endTime: 4 }, 'end', 3, opts)).toEqual({ time: 2, endTime: 7 })
    expect(dragMarkerTimes({ time: 2, endTime: 4 }, 'end', -5, opts)).toEqual({ time: 2, endTime: 2.1 })
    expect(dragMarkerTimes({ time: 2, endTime: 4 }, 'end', 50, opts)).toEqual({ time: 2, endTime: 10 })
  })

  it('turns a point into a span when its end is dragged to the right', () => {
    expect(dragMarkerTimes({ time: 2 }, 'end', 1.5, opts)).toEqual({ time: 2, endTime: 3.5 })
    expect(dragMarkerTimes({ time: 2 }, 'end', 0.01, opts)).toEqual({ time: 2, endTime: 2.1 })
    expect(dragMarkerTimes({ time: 9.95 }, 'end', 5, opts)).toEqual({ time: 9.95, endTime: 10 })
  })

  it('leaves a point a point when its end is dragged to the left', () => {
    expect(dragMarkerTimes({ time: 2 }, 'end', -1, opts)).toEqual({ time: 2 })
  })

  describe('with frames longer than the minimum span, as in a GIF with a held frame', () => {
    const wholeSeconds = { duration: 10, minSpan: 0.1, snap: (t) => Math.floor(t) }

    it('keeps the previous times instead of snapping an end back onto its start', () => {
      expect(dragMarkerTimes({ time: 2 }, 'end', 0.3, wholeSeconds)).toEqual({ time: 2 })
      expect(dragMarkerTimes({ time: 2, endTime: 3 }, 'end', -0.6, wholeSeconds)).toEqual({ time: 2, endTime: 3 })
      expect(dragMarkerTimes({ time: 2, endTime: 2.5 }, 'move', 0.2, wholeSeconds)).toEqual({ time: 2, endTime: 2.5 })
    })

    it('reaches the next frame when the minimum span is the marker\'s own frame', () => {
      expect(dragMarkerTimes({ time: 2 }, 'end', 0.3, { ...wholeSeconds, minSpan: 1 })).toEqual({ time: 2, endTime: 3 })
    })
  })

  it('applies a snap function to every resulting time', () => {
    const snap = (t) => Math.floor(t * 4) / 4
    expect(dragMarkerTimes({ time: 2 }, 'move', 0.6, { ...opts, snap })).toEqual({ time: 2.5 })
  })
})

describe('formatTimes', () => {
  it('writes a moment as its time and a span as both ends', () => {
    expect(formatTimes({ time: 1.5 })).toBe('00:01.500')
    expect(formatTimes({ time: 1, endTime: 2 })).toBe('00:01.000 to 00:02.000')
  })

  it('takes the words around the times', () => {
    const words = { at: 'At ', from: 'Span ', to: ' → ' }
    expect(formatTimes({ time: 1.5 }, words)).toBe('At 00:01.500')
    expect(formatTimes({ time: 1, endTime: 2 }, words)).toBe('Span 00:01.000 → 00:02.000')
  })

  it('returns null without a time', () => {
    expect(formatTimes(null)).toBeNull()
    expect(formatTimes({ type: 'comment' })).toBeNull()
  })
})
