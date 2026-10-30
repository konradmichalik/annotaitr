// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { CommentPopover } from '../../../client/markdown/src/components/CommentPopover.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let anchor
let onRemove

async function render() {
  await act(async () => {
    root.render(<CommentPopover anchorEl={anchor} onRemove={onRemove} onSubmit={vi.fn()} onClose={vi.fn()} />)
  })
}

const field = () => document.body.querySelector('textarea')
const typeInto = (value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field(), value)
  field().dispatchEvent(new Event('input', { bubbles: true }))
})
const backspace = () => act(() => {
  field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))
})
const expand = () => act(() => { document.body.querySelector('[aria-label="Expand comment editor"]').click() })

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  anchor = document.createElement('span')
  anchor.getBoundingClientRect = () => ({ top: 200, bottom: 220, left: 100, right: 200, width: 100, height: 20 })
  document.body.append(anchor)
  onRemove = vi.fn()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  anchor.remove()
})

describe('markdown CommentPopover removal', () => {
  it('removes on Backspace in a field nothing was typed into', async () => {
    await render()
    backspace()
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('remembers that text was typed and cleared when the editor expands, which remounts the composer', async () => {
    await render()
    typeInto('a')
    typeInto('')
    expand()
    expect(document.body.querySelector('.comment-popover--dialog')).not.toBeNull()
    backspace()
    expect(onRemove).not.toHaveBeenCalled()
  })
})
