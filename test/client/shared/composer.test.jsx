// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Composer } from '../../../client/shared/components/Composer.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function renderComposer(props = {}) {
  const handlers = { onSave: vi.fn(), onDiscard: vi.fn() }
  act(() => {
    root.render(
      <Composer title="Note 3, box" submitLabel="Add" dirty={false} {...handlers} {...props}>
        <textarea aria-label="field" />
      </Composer>
    )
  })
  return handlers
}

const field = () => container.querySelector('textarea')
const press = (target, key, init = {}) => act(() => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
})
const pressOutside = () => act(() => {
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, detail: 1 }))
})

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Composer', () => {
  it('is a dialog named by its hidden heading, with Cancel and the submit button', () => {
    renderComposer()
    const dialog = container.querySelector('[role="dialog"]')
    const heading = document.getElementById(dialog.getAttribute('aria-labelledby'))
    expect(heading.textContent).toBe('Note 3, box')
    expect(heading.className).toBe('visually-hidden')
    const buttons = [...container.querySelectorAll('button')]
    expect(buttons.map((b) => b.getAttribute('type'))).toEqual(['button', 'button'])
    expect(buttons[0].textContent).toBe('Cancel')
    expect(buttons[1].textContent).toMatch(/^Add/)
  })

  it('saves on Cmd+Enter but leaves Cmd+Shift+Enter to the decision', () => {
    const { onSave } = renderComposer()
    press(field(), 'Enter', { metaKey: true, shiftKey: true })
    expect(onSave).not.toHaveBeenCalled()
    press(field(), 'Enter', { metaKey: true })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('does not save while the submit is disabled', () => {
    const { onSave } = renderComposer({ submitDisabled: true })
    press(field(), 'Enter', { ctrlKey: true })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('discards on Escape, unless something inside handled it first', () => {
    const { onDiscard } = renderComposer()
    field().addEventListener('keydown', (event) => event.preventDefault(), { once: true })
    press(field(), 'Escape')
    expect(onDiscard).not.toHaveBeenCalled()
    press(field(), 'Escape')
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('closes an untouched composer on a click outside', () => {
    const { onDiscard } = renderComposer({ dirty: false })
    pressOutside()
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('keeps a draft open on a click outside', () => {
    const { onDiscard } = renderComposer({ dirty: true })
    pressOutside()
    expect(onDiscard).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('ignores a click inside', () => {
    const { onDiscard } = renderComposer({ dirty: false })
    act(() => { field().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, detail: 1 })) })
    expect(onDiscard).not.toHaveBeenCalled()
  })
})
