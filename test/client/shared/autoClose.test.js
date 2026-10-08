import { describe, it, expect } from 'vitest'
import { IDLE, countdownReducer, startState } from '../../../client/shared/utils/autoClose.js'

const run = (state, ...types) => types.reduce((current, type) => countdownReducer(current, { type }), state)

describe('startState', () => {
  it('maps the Close tab setting onto the countdown', () => {
    expect(startState('off')).toEqual({ phase: 'off' })
    expect(startState('0')).toEqual({ phase: 'closing' })
    expect(startState('3')).toEqual({ phase: 'counting', total: 3, remaining: 3 })
    expect(startState('5')).toEqual({ phase: 'counting', total: 5, remaining: 5 })
  })

  it('keeps the tab open for a value it does not know', () => {
    expect(startState('soon')).toEqual({ phase: 'off' })
    expect(startState(undefined)).toEqual({ phase: 'off' })
  })
})

describe('countdownReducer', () => {
  const counting = countdownReducer(IDLE, { type: 'start', delay: '3' })

  it('counts down once a second and closes at zero', () => {
    expect(run(counting, 'tick').remaining).toBe(2)
    expect(run(counting, 'tick', 'tick')).toMatchObject({ phase: 'counting', remaining: 1 })
    expect(run(counting, 'tick', 'tick', 'tick')).toEqual({ phase: 'closing' })
  })

  it('stops for good on Keep open', () => {
    expect(run(counting, 'keep', 'tick', 'tick', 'tick')).toEqual({ phase: 'kept' })
  })

  it('reports a tab the browser would not close', () => {
    expect(run(counting, 'tick', 'tick', 'tick', 'failed')).toEqual({ phase: 'closeFailed' })
  })

  it('starts only once, so a later setting change does not restart it', () => {
    const later = countdownReducer(run(counting, 'tick'), { type: 'start', delay: '5' })
    expect(later.remaining).toBe(2)
  })

  it('ignores ticks and Keep open when nothing counts', () => {
    const off = countdownReducer(IDLE, { type: 'start', delay: 'off' })
    expect(run(off, 'tick', 'keep', 'failed')).toEqual({ phase: 'off' })
  })
})
