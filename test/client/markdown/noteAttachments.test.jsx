// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AnnotationPanel } from '../../../client/markdown/src/components/AnnotationPanel.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const blocks = [{ id: 'block-0', type: 'paragraph', content: 'Hello world', startLine: 3 }]
const id = `${'a'.repeat(32)}.png`
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

describe('a note with attached images in the panel', () => {
  it('shows each image below the comment, named by its file', () => {
    render([note({ attachments: [{ id, path: `/tmp/annotaitr-attachments/${id}`, name: 'render.png' }] })])
    const images = [...host.querySelectorAll('.note-card .note-attachments img')]
    expect(images.map((img) => [img.alt, img.getAttribute('src')])).toEqual([['Attached image 1: render.png', `/api/attachments/${id}`]])
    expect(host.querySelector('.note-attachments a').textContent).toBe('(opens in a new tab)')
  })

  it('shows nothing extra for a note without images', () => {
    render([note({})])
    expect(host.querySelector('.note-attachments')).toBeNull()
  })
})
