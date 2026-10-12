// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useShiftHeld } from '../../../client/markdown/src/hooks/useShiftHeld.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function Probe() {
  return <span data-testid="held">{String(useShiftHeld())}</span>
}

let container
let root

const press = (key, type = 'keydown') => act(() => {
  document.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }))
})
const held = () => container.textContent

beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(<Probe />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe('useShiftHeld', () => {
  it('turns on once Shift has been held for a moment', () => {
    press('Shift')
    expect(held()).toBe('false')
    act(() => vi.advanceTimersByTime(200))
    expect(held()).toBe('true')
  })

  it('turns off when Shift is released', () => {
    press('Shift')
    act(() => vi.advanceTimersByTime(200))
    press('Shift', 'keyup')
    expect(held()).toBe('false')
  })

  it('stays off when another key joins Shift at once, as in Shift+N', () => {
    press('Shift')
    press('N')
    act(() => vi.advanceTimersByTime(200))
    expect(held()).toBe('false')
  })

  it('stays off when Shift is released before the moment has passed', () => {
    press('Shift')
    press('Shift', 'keyup')
    act(() => vi.advanceTimersByTime(200))
    expect(held()).toBe('false')
  })
})
