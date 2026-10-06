import { describe, it, expect } from 'vitest'
import { buildThreads, nextSession, sessionLine } from '../../../../server/core/session/threads.js'

const UUID = 'a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d'
const pin = { id: UUID, type: 'pin', geometry: { x: 1, y: 2 }, text: 'Fix' }
const legacy = { id: 'ann-1', type: 'comment', geometry: null, text: 'Overall' }

describe('buildThreads', () => {
  it('numbers marks in the given order, as the feedback does, and derives the handle', () => {
    expect(buildThreads([pin, legacy])).toEqual([
      { handle: 'a3f19c2e', number: 1, annotation: pin, element: null, replies: [] },
      { handle: null, number: 2, annotation: legacy, element: null, replies: [] }
    ])
  })

  it('records the element a mark points at when a describer is given', () => {
    expect(buildThreads([pin], () => 'button "Buy" · #buy')[0].element).toBe('button "Buy" · #buy')
  })
})

describe('nextSession', () => {
  const target = { kind: 'file', label: 'shot.png' }

  it('starts at round 1', () => {
    expect(nextSession(null, { sessionId: '2f8c1a9e04b7', target, threads: [], now: 9 })).toEqual({
      schemaVersion: 1, sessionId: '2f8c1a9e04b7', round: 1, writtenAt: 9, target, threads: []
    })
  })

  it('counts on from the previous round and replaces its threads', () => {
    const previous = nextSession(null, { sessionId: '2f8c1a9e04b7', target, threads: buildThreads([pin]), now: 1 })
    const next = nextSession(previous, { sessionId: '2f8c1a9e04b7', target, threads: [], now: 2 })
    expect(next.round).toBe(2)
    expect(next.threads).toEqual([])
  })
})

describe('sessionLine', () => {
  const at = (threads) => nextSession(null, { sessionId: '2f8c1a9e04b7', target: {}, threads, now: 1 })

  it('tells the agent how to reply per mark', () => {
    expect(sessionLine(at(buildThreads([pin])))).toBe(
      'Session: 2f8c1a9e04b7 (round 1). Reply per mark with: annotaitr reply --session 2f8c1a9e04b7 ' +
      '--to <handle> --status applied|partial|declined|deferred|question --text "…"\n'
    )
  })

  it('stays silent when there is nothing to reply to', () => {
    expect(sessionLine(at([]))).toBe('')
    expect(sessionLine(at(buildThreads([legacy])))).toBe('')
  })
})
