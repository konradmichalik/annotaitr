// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { RepliesPanel } from '../../../client/markdown/src/components/RepliesPanel.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const thread = {
  handle: 'a1', number: 1, anchor: 'exact', place: { path: 'a.md', where: 'Line 3', line: 3, quote: 'intro' },
  annotation: { type: 'COMMENT', text: 'Shorter' }, replies: [{ author: 'agent', status: 'question', text: 'How short?' }]
}
let host
let root
let onLocate

const card = () => host.querySelector('.previous-round-entry')
const replyButton = () => host.querySelector('.reply-card-reply')
const field = () => host.querySelector('.reply-form-field')
const click = (element) => act(() => element.click())

beforeEach(() => {
  onLocate = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<RepliesPanel round={1} threads={[thread]} multiFile={false} onLocate={onLocate} onReload={() => {}} />))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('RepliesPanel', () => {
  it('opens the thread from the card, which names the thread it controls', () => {
    click(card())
    const detail = host.querySelector('.reply-thread')
    expect(card().getAttribute('aria-expanded')).toBe('true')
    expect(card().getAttribute('aria-controls')).toBe(detail.id)
    expect(onLocate).toHaveBeenCalledTimes(1)
  })

  it('keeps an open thread open on Reply and puts the focus in its field', () => {
    click(card())
    field().blur()
    click(replyButton())
    expect(host.querySelector('.reply-thread')).not.toBeNull()
    expect(document.activeElement).toBe(field())
    expect(onLocate).toHaveBeenCalledTimes(1)
  })

  it('opens a closed thread on Reply with the focus in its field', () => {
    click(replyButton())
    expect(document.activeElement).toBe(field())
  })
})
