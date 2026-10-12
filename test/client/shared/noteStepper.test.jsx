// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { NoteStepper } from '../../../client/shared/components/NoteStepper.jsx'
import { useNoteStepKeys } from '../../../client/shared/hooks/useNoteStepKeys.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (props) => act(() => root.render(<NoteStepper count={3} position={2} onStep={() => {}} {...props} />))
const button = (name) => container.querySelector(`button[aria-label="${name}"]`)

describe('NoteStepper', () => {
  it('is left out with fewer than two notes', () => {
    render({ count: 1, position: 1 })
    expect(container.innerHTML).toBe('')
  })

  it('names the place of the selected note in a live region', () => {
    render({})
    const status = container.querySelector('[aria-live="polite"]')
    expect(status.textContent).toBe('2 of 3')
  })

  it('says how many notes there are while none is selected', () => {
    render({ position: 0 })
    expect(container.querySelector('[aria-live="polite"]').textContent).toBe('3 notes')
  })

  it('steps with its two buttons', () => {
    const onStep = vi.fn()
    render({ onStep })
    act(() => button('Next note').click())
    act(() => button('Previous note').click())
    expect(onStep.mock.calls).toEqual([[1], [-1]])
  })

  it('marks the button at an end as disabled without removing it from the tab order', () => {
    render({ position: 3 })
    expect(button('Next note').getAttribute('aria-disabled')).toBe('true')
    expect(button('Next note').disabled).toBe(false)
    expect(button('Previous note').hasAttribute('aria-disabled')).toBe(false)
    render({ position: 1 })
    expect(button('Previous note').getAttribute('aria-disabled')).toBe('true')
  })

  it('keeps the focus on a button that has just become the end, and does not step past it', () => {
    const onStep = vi.fn()
    render({ position: 2, onStep })
    const next = button('Next note')
    next.focus()
    act(() => next.click())
    render({ position: 3, onStep })
    expect(document.activeElement).toBe(button('Next note'))
    act(() => button('Next note').click())
    expect(onStep.mock.calls).toEqual([[1]])
  })
})

function Keys({ onStep, enabled }) {
  useNoteStepKeys(onStep, enabled)
  return <textarea aria-label="field" />
}

describe('useNoteStepKeys', () => {
  const press = (target, key, init = {}) => act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  })

  it('steps forward on N and back on Shift+N', () => {
    const onStep = vi.fn()
    act(() => root.render(<Keys onStep={onStep} enabled />))
    press(document.body, 'n')
    press(document.body, 'N', { shiftKey: true })
    expect(onStep.mock.calls).toEqual([[1], [-1]])
  })

  it('ignores N while typing, with a modifier or when disabled', () => {
    const onStep = vi.fn()
    act(() => root.render(<Keys onStep={onStep} enabled />))
    press(container.querySelector('textarea'), 'n')
    press(document.body, 'n', { metaKey: true })
    act(() => root.render(<Keys onStep={onStep} enabled={false} />))
    press(document.body, 'n')
    expect(onStep).not.toHaveBeenCalled()
  })
})
