// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Toolbar } from '../../../client/markdown/src/components/Toolbar.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let anchor

function renderToolbar(props = {}) {
  const handlers = { onAnnotate: vi.fn(), onClose: vi.fn(), onDelete: vi.fn(), onQuickLabel: vi.fn() }
  act(() => { root.render(<Toolbar highlightElement={anchor} {...handlers} {...props} />) })
  return handlers
}

const bar = () => document.body.querySelector('.selection-bar')
const dialog = () => document.body.querySelector('[role="dialog"]')
const barLabels = () => [...bar().querySelectorAll('.selection-bar-label')].map((el) => el.textContent)
const press = (key, init = {}) => act(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
})

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  anchor = document.createElement('span')
  anchor.getBoundingClientRect = () => ({ top: 200, bottom: 220, left: 100, right: 200, width: 100, height: 20 })
  document.body.append(anchor)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  anchor.remove()
})

describe('Toolbar over a text selection', () => {
  it('offers Comment and Remove, nothing to decide between', () => {
    renderToolbar()
    expect(barLabels()).toEqual(['Comment', 'Remove', 'Label'])
  })

  it('starts a comment with the key that was typed', () => {
    renderToolbar()
    press('e')
    expect(dialog()).not.toBeNull()
    expect(dialog().querySelector('textarea').value).toBe('e')
    expect(bar()).toBeNull()
  })

  it('starts a comment on a digit too, which used to pick an intent', () => {
    renderToolbar()
    press('3')
    expect(dialog().querySelector('textarea').value).toBe('3')
  })

  it('marks the selection for removal on Backspace', () => {
    const { onAnnotate } = renderToolbar()
    press('Backspace')
    expect(onAnnotate).toHaveBeenCalledTimes(1)
    expect(onAnnotate).toHaveBeenCalledWith('DELETION')
    expect(dialog()).toBeNull()
  })

  it('does not remove on Backspace while a button of the bar has the focus', () => {
    const { onAnnotate } = renderToolbar()
    const label = [...bar().querySelectorAll('button')].find((b) => b.textContent.startsWith('Label'))
    label.focus()
    press('Backspace')
    expect(onAnnotate).not.toHaveBeenCalled()
  })

  it('does not remove on Backspace while the quick label picker is open', () => {
    const { onAnnotate } = renderToolbar()
    act(() => { [...bar().querySelectorAll('button')].find((b) => b.textContent.startsWith('Label')).click() })
    document.body.focus()
    press('Backspace')
    expect(onAnnotate).not.toHaveBeenCalled()
  })

  it('leaves keys with a modifier alone', () => {
    const { onAnnotate } = renderToolbar()
    press('a', { metaKey: true })
    press('Backspace', { ctrlKey: true })
    expect(dialog()).toBeNull()
    expect(onAnnotate).not.toHaveBeenCalled()
  })

  it('removes from the Remove button', () => {
    const { onAnnotate } = renderToolbar()
    act(() => { [...bar().querySelectorAll('button')].find((b) => b.textContent.startsWith('Remove')).click() })
    expect(onAnnotate).toHaveBeenCalledWith('DELETION')
  })

  it('saves a comment without an intent', () => {
    const { onAnnotate } = renderToolbar()
    press('x')
    const field = dialog().querySelector('textarea')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, 'xyz')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => { [...dialog().querySelectorAll('button')].find((b) => b.textContent.startsWith('Add')).click() })
    expect(onAnnotate).toHaveBeenCalledWith('COMMENT', 'xyz', undefined, undefined, [])
  })

  it('offers Remove in the composer, which an opened and still empty field does through Backspace', () => {
    const { onAnnotate } = renderToolbar()
    act(() => { [...bar().querySelectorAll('button')].find((b) => b.textContent.startsWith('Comment')).click() })
    expect([...dialog().querySelectorAll('button')].map((b) => b.textContent)).toContain('Remove⌫')
    act(() => { dialog().querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })) })
    expect(onAnnotate).toHaveBeenCalledWith('DELETION')
  })
})

describe('Toolbar on an existing note', () => {
  it('keeps Delete and Edit and offers no Remove in its composer', () => {
    renderToolbar({ editAnnotation: { id: 'a', type: 'COMMENT', text: 'old', number: 1 } })
    expect(barLabels()).toEqual(['Delete', 'Edit'])
    act(() => { [...bar().querySelectorAll('button')].find((b) => b.textContent.startsWith('Edit')).click() })
    expect([...dialog().querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Remove⌫')
  })
})

describe('Toolbar editing a removal', () => {
  it('keeps the removal when a comment is added to it', () => {
    const { onAnnotate } = renderToolbar({ editAnnotation: { id: 'a', type: 'DELETION', text: '', number: 1 } })
    act(() => { [...bar().querySelectorAll('button')].find((b) => b.textContent.startsWith('Comment')).click() })
    const field = dialog().querySelector('textarea')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, 'Not needed here')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => { [...dialog().querySelectorAll('button')].find((b) => b.textContent.startsWith('Save')).click() })
    expect(onAnnotate).toHaveBeenCalledWith('COMMENT', 'Not needed here', undefined, 'remove', [])
  })

  it('leaves the kind to the type for a comment', () => {
    const { onAnnotate } = renderToolbar({ editAnnotation: { id: 'a', type: 'COMMENT', text: 'old', number: 1 } })
    act(() => { [...bar().querySelectorAll('button')].find((b) => b.textContent.startsWith('Edit')).click() })
    act(() => { [...dialog().querySelectorAll('button')].find((b) => b.textContent.startsWith('Save')).click() })
    expect(onAnnotate).toHaveBeenCalledWith('COMMENT', 'old', undefined, undefined, [])
  })
})
