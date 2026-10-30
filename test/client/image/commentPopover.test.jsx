// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import CommentPopover from '../../../client/image/src/components/CommentPopover.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function renderPopover(props = {}) {
  const handlers = { onSubmit: vi.fn(), onClose: vi.fn() }
  act(() => {
    root.render(
      <CommentPopover
        anchorPoint={{ x: 100, y: 100 }} title="Note 1, box" initialIntent="comment" annotationType="box"
        {...handlers} {...props}
      />
    )
  })
  return handlers
}

const dialog = () => document.body.querySelector('[role="dialog"]')
const field = () => dialog().querySelector('textarea')
const removeButton = () => [...dialog().querySelectorAll('button')].find((b) => b.textContent.startsWith('Remove'))
const type = (value) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(field(), value)
  field().dispatchEvent(new Event('input', { bubbles: true }))
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

describe('image CommentPopover', () => {
  it('has no intent to pick', () => {
    renderPopover()
    expect(dialog().querySelector('[aria-haspopup="menu"]')).toBeNull()
    expect(dialog().textContent).not.toMatch(/Change|Question/)
  })

  it('saves what was typed as a comment', () => {
    const { onSubmit } = renderPopover()
    type('  Tighten this  ')
    act(() => { [...dialog().querySelectorAll('button')].find((b) => b.textContent.startsWith('Add')).click() })
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ text: 'Tighten this', intent: 'comment' }))
  })

  it('saves a removal at once, with the words typed so far as its reason', () => {
    const { onSubmit } = renderPopover()
    type('Not needed')
    act(() => removeButton().click())
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ text: 'Not needed', intent: 'remove' }))
  })

  it('removes on Backspace before anything was typed', () => {
    const { onSubmit } = renderPopover()
    act(() => { field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })) })
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ text: '', intent: 'remove' }))
  })

  it('does not offer Remove while editing, and keeps the kind the note has', () => {
    const { onSubmit } = renderPopover({ isEditing: true, initialText: 'old', initialIntent: 'remove' })
    expect(removeButton()).toBeUndefined()
    act(() => { [...dialog().querySelectorAll('button')].find((b) => b.textContent.startsWith('Save')).click() })
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ text: 'old', intent: 'remove' }))
  })
})
