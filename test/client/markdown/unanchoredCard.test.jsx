// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AnnotationPanel } from '../../../client/markdown/src/components/AnnotationPanel.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const blocks = [{ id: 'block-0', type: 'paragraph', content: 'Hello world', startLine: 3 }]
const note = (overrides) => ({
  id: 'n1', blockId: 'block-0', startOffset: 0, endOffset: 5, type: 'COMMENT', number: 1,
  intent: 'comment', text: 'Fix', originalText: 'Hello', ...overrides
})

let host
let root

function render(annotations) {
  const files = [{ path: 'a.md', blocks, annState: { annotations } }]
  act(() => root.render(
    <AnnotationPanel
      files={files} activeFileIndex={0} annotations={annotations} blocks={blocks}
      selectedAnnotationId={null} onSelect={() => {}} onOpenNote={() => {}} onEdit={() => {}} onDelete={() => {}}
      onExport={() => {}} onImport={() => {}} generalComment={null}
      onSaveGeneralComment={() => {}} generalDisabled={false} approves={false} collapsed={false}
    />
  ))
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0 })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('an unanchored note in the panel', () => {
  it('shows an Unanchored tag in place of its line and names it for screen readers', () => {
    render([note({ unanchored: true })])
    const card = host.querySelector('.note-card')
    const tag = card.querySelector('.note-tag')
    expect(tag.firstChild.textContent).toBe('Unanchored')
    expect(tag.getAttribute('title')).toBe('Text no longer in the file')
    expect(tag.querySelector('.visually-hidden').textContent).toBe(': text no longer in the file')
    expect(card.querySelector('.note-location')).toBeNull()
    expect(card.querySelector('.note-card-select').getAttribute('aria-label')).toBe('1. Comment, Unanchored: text no longer in the file')
  })

  it('offers delete but no edit, since there is no text left to edit it on', () => {
    render([note({ unanchored: true })])
    const card = host.querySelector('.note-card')
    expect(card.querySelector('[aria-label="Edit annotation"]')).toBeNull()
    expect(card.querySelector('[aria-label="Delete annotation"]')).not.toBeNull()
  })

  it('leaves an anchored note as it was', () => {
    render([note()])
    const card = host.querySelector('.note-card')
    expect(card.querySelector('.note-tag')).toBeNull()
    expect(card.querySelector('.note-location').textContent).toBe('L3')
  })
})
