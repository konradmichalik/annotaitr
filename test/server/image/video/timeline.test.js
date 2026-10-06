import { describe, it, expect } from 'vitest'
import {
  formatTimecode, formatFileTime, orderVideoAnnotations, validateVideoAnnotations, planFrames,
  STRIP_FRAME_COUNT, OVERVIEW_FRAME_COUNT
} from '../../../../server/image/video/timeline.js'

const box = (id, time, extra = {}) => ({ id, type: 'box', geometry: { x: 1, y: 1, width: 5, height: 5 }, time, ...extra })
const comment = (id, extra = {}) => ({ id, type: 'comment', geometry: null, text: 'c', ...extra })

describe('formatTimecode', () => {
  it('formats minutes, seconds and milliseconds', () => {
    expect(formatTimecode(0)).toBe('00:00.000')
    expect(formatTimecode(3.24)).toBe('00:03.240')
    expect(formatTimecode(754.2)).toBe('12:34.200')
  })

  it('adds hours from one hour on', () => {
    expect(formatTimecode(3723.5)).toBe('1:02:03.500')
  })

  it('never rounds up into an invalid 60th second', () => {
    expect(formatTimecode(59.9996)).toBe('01:00.000')
  })
})

describe('formatFileTime', () => {
  it('produces a filename-safe timestamp', () => {
    expect(formatFileTime(3.24)).toBe('00m03.240s')
    expect(formatFileTime(3723.5)).toBe('1h02m03.500s')
  })
})

describe('orderVideoAnnotations', () => {
  it('sorts timed annotations by time and puts untimed comments last', () => {
    const ordered = orderVideoAnnotations([
      comment('g'),
      box('b', 5),
      box('a', 1),
      comment('s', { time: 3, endTime: 4 })
    ])
    expect(ordered.map((a) => a.id)).toEqual(['a', 's', 'b', 'g'])
  })

  it('keeps insertion order for equal times', () => {
    const ordered = orderVideoAnnotations([box('x', 2), box('y', 2)])
    expect(ordered.map((a) => a.id)).toEqual(['x', 'y'])
  })
})

describe('validateVideoAnnotations', () => {
  it('accepts points, spans, span comments and general comments', () => {
    expect(validateVideoAnnotations([
      box('a', 1), box('b', 1, { endTime: 2 }), comment('c', { time: 0, endTime: 1 }), comment('d')
    ])).toBeNull()
  })

  it('requires a time on every drawn annotation', () => {
    expect(validateVideoAnnotations([box('a', undefined)])).toMatch(/time/)
  })

  it('rejects negative or non-finite times', () => {
    expect(validateVideoAnnotations([box('a', -1)])).toMatch(/time/)
    expect(validateVideoAnnotations([box('a', Infinity)])).toMatch(/time/)
    expect(validateVideoAnnotations([box('a', '1')])).toMatch(/time/)
  })

  it('requires endTime to be after time', () => {
    expect(validateVideoAnnotations([box('a', 2, { endTime: 2 })])).toMatch(/endTime/)
    expect(validateVideoAnnotations([comment('c', { endTime: 2 })])).toMatch(/endTime/)
  })
})

describe('planFrames', () => {
  it('groups annotations sharing a time onto one frame with their global numbers', () => {
    const ordered = orderVideoAnnotations([box('a', 1), box('b', 4), box('c', 1)])
    const plan = planFrames(ordered, 10)
    expect(plan.frames.map((f) => f.time)).toEqual([1, 4])
    expect(plan.frames[0].entries.map((e) => [e.annotation.id, e.number])).toEqual([['a', 1], ['c', 2]])
    expect(plan.frames[1].entries.map((e) => e.number)).toEqual([3])
  })

  it('adds a strip of evenly spaced frames for every span', () => {
    const plan = planFrames([box('a', 2, { endTime: 4.5 })], 10)
    expect(plan.strips).toHaveLength(1)
    expect(plan.strips[0].times).toHaveLength(STRIP_FRAME_COUNT)
    expect(plan.strips[0].times[0]).toBe(2)
    expect(plan.strips[0].times.at(-1)).toBe(4.5)
  })

  it('spreads the overview across the whole recording and marks annotation numbers on the nearest tile', () => {
    const plan = planFrames([box('a', 0.1), box('b', 9.9)], 12)
    expect(plan.overview.times).toHaveLength(OVERVIEW_FRAME_COUNT)
    expect(plan.overview.times[0]).toBe(0.5)
    expect(plan.overview.times.at(-1)).toBe(11.5)
    expect(plan.overview.numbersByTile[0]).toEqual([1])
    expect(plan.overview.numbersByTile[9]).toEqual([2])
  })

  it('lists every distinct time once, sorted', () => {
    const plan = planFrames([box('a', 0.5)], 12)
    expect(plan.times).toEqual([...new Set(plan.times)].sort((x, y) => x - y))
    expect(plan.times).toContain(0.5)
  })

  it('adds a span drawing to the later frames it covers, but not to frames outside it', () => {
    const ordered = orderVideoAnnotations([box('s', 1, { endTime: 3 }), box('p', 2), box('q', 4)])
    const plan = planFrames(ordered, 10)
    const ids = (time) => plan.frames.find((f) => f.time === time).entries.map((e) => e.annotation.id)
    expect(ids(2)).toEqual(['s', 'p'])
    expect(ids(4)).toEqual(['q'])
  })

  it('leaves general comments out of every frame', () => {
    const plan = planFrames([comment('g')], 10)
    expect(plan.frames).toEqual([])
    expect(plan.strips).toEqual([])
  })
})
