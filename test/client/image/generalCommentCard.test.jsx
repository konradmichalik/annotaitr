// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import AnnotationPanel from '../../../client/image/src/components/AnnotationPanel.jsx'
import { GeneralCommentRow } from '../../../client/shared/components/GeneralCommentRow.jsx'
import { useGeneralComment } from '../../../client/shared/hooks/useGeneralComment.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const note = { id: 'n1', type: 'box', number: 1, intent: 'change', text: 'Tighten this', geometry: { x: 0, y: 0, width: 1, height: 1 } }
const general = (text) => ({ id: 'g1', type: 'comment', text })

let host
let root
let saved

function Harness({ initial, withNote }) {
  const [comment, setComment] = useState(initial ? general(initial) : null)
  const editor = useGeneralComment({
    text: comment?.text || null,
    onSave: (text) => { saved.push(text); setComment(text ? general(text) : null) }
  })
  const annotations = [...(withNote ? [note] : []), ...(comment ? [comment] : [])]
  return (
    <>
      <AnnotationPanel annotations={annotations} hidden={comment} generalEditor={editor} onRemove={() => {}} onEdit={() => {}} onEditComment={() => {}} emptyKeys={[]} />
      <GeneralCommentRow editor={editor} />
    </>
  )
}

const mount = (props) => act(() => root.render(<Harness {...props} />))
const card = () => host.querySelector('li[data-annotation-id="g1"]')

function type(field, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0 })
  saved = []
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('general comment card', () => {
  it('shows no card without text and keeps the empty hint', () => {
    mount({ initial: null, withNote: false })
    expect(card()).toBeNull()
    expect(host.textContent).toContain('Every mark becomes a numbered note')
    expect(host.querySelector('.general-comment-row').textContent).toContain('General comment')
  })

  it('shows the full text as the first card, without number or intent, and treats the panel as non-empty', () => {
    const long = 'Overall the spacing is off. '.repeat(10).trim()
    mount({ initial: long, withNote: false })
    expect(host.textContent).not.toContain('Every mark becomes a numbered note')
    expect(card().textContent).toContain(long)
    expect(card().querySelector('.note-number')).toBeNull()
    expect(card().querySelector('.note-type').textContent).toBe('General')
    expect(card().querySelector('.note-card-select').getAttribute('aria-label')).toBe('General comment')
  })

  it('does not announce a pressed state, the card only opens the editor', () => {
    mount({ initial: 'Overall fine', withNote: true })
    expect(card().querySelector('.note-card-select').hasAttribute('aria-pressed')).toBe(false)
    expect(host.querySelector('li[data-annotation-id="n1"] .note-card-select').getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps showing the saved text while the editor is open', () => {
    mount({ initial: 'Overall fine', withNote: false })
    act(() => card().querySelector('.note-card-select').click())
    type(host.querySelector('textarea'), 'Draft')
    expect(card().textContent).toContain('Overall fine')
    expect(card().textContent).not.toContain('Draft')
  })

  it('comes before the numbered cards', () => {
    mount({ initial: 'Overall fine', withNote: true })
    const ids = [...host.querySelectorAll('li.note-card')].map((li) => li.dataset.annotationId)
    expect(ids).toEqual(['g1', 'n1'])
  })

  it('does not repeat the text in the bottom row and offers to edit it', () => {
    mount({ initial: 'Overall fine', withNote: false })
    const row = host.querySelector('.general-comment-row')
    expect(row.textContent).toContain('Edit general comment')
    expect(row.textContent).not.toContain('Overall fine')
  })

  it('edits through the labelled field of the row, from Enter on the card', () => {
    mount({ initial: 'Overall fine', withNote: false })
    act(() => card().querySelector('.note-card-select').click())
    const field = host.querySelector('textarea')
    expect(field.labels[0].textContent).toBe('General comment')
    expect(field.value).toBe('Overall fine')
    type(field, 'Needs work')
    act(() => host.querySelector('.panel-global-save-btn').click())
    expect(saved).toEqual(['Needs work'])
    expect(card().textContent).toContain('Needs work')
  })

  it('edits through the pen action', () => {
    mount({ initial: 'Overall fine', withNote: false })
    act(() => card().querySelector('button[aria-label="Edit annotation"]').click())
    expect(host.querySelector('textarea').value).toBe('Overall fine')
  })

  it('deletes the comment and brings back the empty hint', () => {
    mount({ initial: 'Overall fine', withNote: false })
    act(() => card().querySelector('button[aria-label="Delete annotation"]').click())
    expect(saved).toEqual([''])
    expect(card()).toBeNull()
    expect(host.textContent).toContain('Every mark becomes a numbered note')
  })

  it('adds the card after the first save and opens the editor with G', () => {
    mount({ initial: null, withNote: false })
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })))
    type(host.querySelector('textarea'), 'First')
    act(() => host.querySelector('.panel-global-save-btn').click())
    expect(card().textContent).toContain('First')
  })
})
