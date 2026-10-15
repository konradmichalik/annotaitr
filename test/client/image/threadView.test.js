import { describe, it, expect } from 'vitest'
import { badgeShowsNumber, placedThreads, threadPageCounts, threadsQuery } from '../../../client/image/src/threads/threadView.js'

const box = (extra = {}) => ({ type: 'box', geometry: { x: 1, y: 1, width: 5, height: 5 }, text: 'Fix', ...extra })
const thread = (annotation, extra = {}) => ({ handle: 'a3f19c2e', number: 1, annotation, element: null, replies: [], anchor: 'exact', reason: null, ...extra })

describe('placedThreads', () => {
  it('draws exact and ghost marks on a still image, never orphans or general comments', () => {
    const threads = [
      thread(box()), thread(box(), { anchor: 'ghost' }), thread(box(), { anchor: 'orphan' }),
      thread({ type: 'comment', geometry: null, text: 'Overall' })
    ]
    expect(placedThreads(threads, { kind: 'still' }).map((t) => t.anchor)).toEqual(['exact', 'ghost'])
  })

  it('shows a video mark only inside its time window, spans included', () => {
    const point = thread(box({ time: 2 }))
    const span = thread(box({ time: 3, endTime: 6 }))
    const at = (time) => placedThreads([point, span], { kind: 'video', time, tolerance: 0.02 })
    expect(at(2)).toEqual([point])
    expect(at(4.5)).toEqual([span])
    expect(at(8)).toEqual([])
  })

  it('shows a PDF mark only on its page', () => {
    const one = thread(box({ page: 1 }))
    const two = thread(box({ page: 2 }))
    expect(placedThreads([one, two], { kind: 'document', page: 2 })).toEqual([two])
  })
})

describe('threadPageCounts', () => {
  it('counts placed threads per page', () => {
    const threads = [thread(box({ page: 2 })), thread(box({ page: 2 })), thread(box({ page: 3 }), { anchor: 'orphan' })]
    expect([...threadPageCounts(threads)]).toEqual([[2, 2]])
  })
})

describe('threadsQuery', () => {
  it('passes a known video duration and nothing otherwise', () => {
    expect(threadsQuery(12.5)).toBe('?duration=12.5')
    expect(threadsQuery(undefined)).toBe('')
    expect(threadsQuery(Number.NaN)).toBe('')
  })
})

describe('badgeShowsNumber', () => {
  it('is false for a pin, which is its own number', () => {
    expect(badgeShowsNumber(thread({ type: 'pin', geometry: { x: 1, y: 1 } }))).toBe(false)
  })

  it('is true for every other mark, which an earlier round draws without its number badge', () => {
    for (const type of ['box', 'arrow', 'freehand', 'highlighter', 'element', 'text']) {
      expect(badgeShowsNumber(thread({ type }))).toBe(true)
    }
  })
})
