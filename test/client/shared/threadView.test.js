import { describe, it, expect } from 'vitest'
import {
  STATUS_DISPLAY, statusDisplay, readPreviousRound, threadStatus, orphanThreads,
  threadTitle, threadNumber, threadLabel, pendingReplyCount, openQuestions, threadMessages
} from '../../../client/shared/threads/threadView.js'

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

describe('orphanThreads', () => {
  it('lists the threads whose place no longer exists', () => {
    const orphan = thread(box(), { anchor: 'orphan', reason: 'Page 3 is not part of this review' })
    expect(orphanThreads([thread(box()), orphan])).toEqual([orphan])
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

describe('thread labels', () => {
  it('names a thread of last round by round and number', () => {
    expect(threadTitle(thread(box(), { number: 2 }), 1)).toBe('Round 1 · note 2')
  })

  it('names an unnumbered thread a general comment, never "note null"', () => {
    expect(threadTitle(thread(box(), { number: null }), 1)).toBe('Round 1 · general comment')
  })

  it('names a carried thread by its origin, never "mark null"', () => {
    const carried = thread(box(), { number: null, origin: { round: 1, number: 2 } })
    expect(threadTitle(carried, 2)).toBe('Round 1 · note 2')
    expect(threadNumber(carried)).toBe(2)
  })

  it('labels a thread with its own number, and a carried one with its origin round so it cannot collide', () => {
    expect(threadLabel(thread(box(), { number: 2 }), 2)).toBe('2')
    expect(threadLabel(thread(box(), { number: null, origin: { round: 1, number: 2 } }), 2)).toBe('1·2')
    expect(threadLabel(thread(box(), { number: null, origin: { round: 2, number: 2 } }), 2)).toBe('2')
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

describe('threadMessages', () => {
  it('opens with the note of the reviewer and tags agent replies with the round they answer', () => {
    const t = thread(box(), { origin: { round: 1, number: 2 }, replies: [reply('applied'), { author: 'human', text: 'Thanks' }] })
    expect(threadMessages(t, 2)).toEqual([
      { id: 'note', author: 'human', text: 'Fix', meta: 'round 1' },
      { ...reply('applied'), meta: 'after round 1' },
      { author: 'human', text: 'Thanks' }
    ])
  })
})
