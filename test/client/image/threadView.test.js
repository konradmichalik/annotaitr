import { describe, it, expect } from 'vitest'
import {
  STATUS_DISPLAY, statusDisplay, badgeShowsNumber, readPreviousRound, threadStatus, placedThreads, orphanThreads, threadPageCounts, threadsQuery,
  threadTitle, threadNumber, pendingReplyCount, openQuestions
} from '../../../client/image/src/threads/threadView.js'

const box = (extra = {}) => ({ type: 'box', geometry: { x: 1, y: 1, width: 5, height: 5 }, text: 'Fix', ...extra })
const thread = (annotation, extra = {}) => ({ handle: 'a3f19c2e', number: 1, annotation, element: null, replies: [], anchor: 'exact', reason: null, ...extra })
const reply = (status) => ({ author: 'agent', status, text: 'Done', createdAt: 1 })

describe('threadStatus', () => {
  it('is the status of the last reply', () => {
    expect(threadStatus(thread(box(), { replies: [reply('partial'), reply('applied')] }))).toBe('applied')
  })

  it('is none without replies', () => {
    expect(threadStatus(thread(box()))).toBe('none')
  })

  it('has an icon and a text label for every status, so colour is never the only signal', () => {
    for (const status of ['applied', 'partial', 'declined', 'deferred', 'question', 'none']) {
      expect(STATUS_DISPLAY[status].icon).toBeTruthy()
      expect(STATUS_DISPLAY[status].label).toBeTruthy()
    }
    expect(STATUS_DISPLAY.none.label).toBe('no reply')
  })
})

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

describe('orphanThreads', () => {
  it('lists the threads whose place no longer exists', () => {
    const orphan = thread(box(), { anchor: 'orphan', reason: 'Page 3 is not part of this review' })
    expect(orphanThreads([thread(box()), orphan])).toEqual([orphan])
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

describe('statusDisplay', () => {
  it('looks up the display of the last reply status', () => {
    expect(statusDisplay(thread(box(), { replies: [reply('declined')] }))).toBe(STATUS_DISPLAY.declined)
  })

  it('falls back to the no-reply display for a status a hand-edited session invented', () => {
    expect(statusDisplay(thread(box(), { replies: [reply('wontfix')] }))).toBe(STATUS_DISPLAY.none)
  })
})

describe('readPreviousRound', () => {
  const empty = { round: null, threads: [] }

  it('reads round and threads from a well-formed body', () => {
    const t = thread(box())
    expect(readPreviousRound({ data: { round: 2, threads: [t] } })).toEqual({ round: 2, threads: [t] })
  })

  it.each([
    ['a failed response', null],
    ['a body without data', {}],
    ['threads that are not an array', { data: { round: 2, threads: 'nope' } }],
    ['threads missing', { data: { round: 2 } }]
  ])('is empty for %s', (_, body) => {
    expect(readPreviousRound(body).threads).toEqual([])
    if (body === null) { expect(readPreviousRound(body)).toEqual(empty) }
  })
})

describe('badgeShowsNumber', () => {
  it('is false for marks that already draw their number', () => {
    expect(badgeShowsNumber(thread({ type: 'pin', geometry: { x: 1, y: 1 } }))).toBe(false)
    expect(badgeShowsNumber(thread({ type: 'text', geometry: { x: 1, y: 1, width: 5, height: 5 } }))).toBe(false)
  })

  it('is true for marks without a number of their own', () => {
    for (const type of ['box', 'arrow', 'freehand', 'highlighter', 'element']) {
      expect(badgeShowsNumber(thread({ type }))).toBe(true)
    }
  })
})

describe('thread labels', () => {
  it('names a thread of last round by round and number', () => {
    expect(threadTitle(thread(box(), { number: 2 }), 1)).toBe('Round 1 · mark 2')
  })

  it('names a carried thread by its origin, never "mark null"', () => {
    const carried = thread(box(), { number: null, origin: { round: 1, number: 2 } })
    expect(threadTitle(carried, 2)).toBe('Round 1 · mark 2')
    expect(threadNumber(carried)).toBe(2)
  })
})

describe('pending replies and open questions', () => {
  const asked = thread(box(), { replies: [{ author: 'agent', status: 'question', text: '?' }] })
  const answered = thread(box(), { replies: [{ author: 'agent', status: 'question', text: '?' }, { author: 'human', text: 'Green', pending: true }] })
  const applied = thread(box(), { replies: [{ author: 'agent', status: 'applied', text: 'ok' }] })

  it('counts pending replies across threads', () => {
    expect(pendingReplyCount([asked, answered, applied])).toBe(1)
  })

  it('lists questions the reviewer has not answered yet', () => {
    expect(openQuestions([asked, answered, applied])).toEqual([asked])
  })

  it('reads a thread as unanswered while the reviewer has the last sent word', () => {
    const sent = thread(box(), { replies: [{ author: 'agent', status: 'question', text: '?' }, { author: 'human', text: 'Green' }] })
    expect(threadStatus(sent)).toBe('none')
  })

  it('ignores a pending reply when reading the status', () => {
    expect(threadStatus(answered)).toBe('question')
  })

  it('does not list a question the reviewer answered, sent or pending', () => {
    const sent = thread(box(), { replies: [{ author: 'agent', status: 'question', text: '?' }, { author: 'human', text: 'Green' }] })
    expect(openQuestions([asked, answered, sent])).toEqual([asked])
  })
})
