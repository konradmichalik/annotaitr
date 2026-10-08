// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AnnotationPanel } from '../../../client/markdown/src/components/AnnotationPanel.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const file = (path) => ({ path, blocks: [], annState: { annotations: [] } })
const files = [file('a.md'), file('b.md')]

let host
let root

function render(activeFileIndex, onSaveGeneralComment) {
  act(() => root.render(
    <AnnotationPanel
      files={files} activeFileIndex={activeFileIndex} annotations={[]} blocks={[]}
      selectedAnnotationId={null} onSelect={() => {}} onOpenNote={() => {}} onEdit={() => {}} onDelete={() => {}}
      onExport={() => {}} onImport={() => {}} generalComment={null}
      onSaveGeneralComment={onSaveGeneralComment} generalDisabled={false} approves={false} collapsed={false}
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

describe('general comment across files', () => {
  it('does not carry an open draft from one file into the next', () => {
    const saveA = vi.fn()
    const saveB = vi.fn()
    render(0, saveA)
    act(() => host.querySelector('.general-comment-row').click())
    const field = host.querySelector('textarea')
    expect(field).not.toBeNull()
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      setter.call(field, 'only for A')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })

    render(1, saveB)

    expect(host.querySelector('textarea')).toBeNull()
    expect(host.textContent).not.toContain('only for A')
    expect(saveB).not.toHaveBeenCalled()
    expect(saveA).not.toHaveBeenCalled()
  })
})

describe('general comment card across files', () => {
  const withComment = (path, text) => ({ path, blocks: [], annState: { annotations: text ? [{ id: `g-${path}`, type: 'COMMENT', targetType: 'global', text }] : [] } })

  function renderWith(fileList, activeFileIndex, onSave = () => {}) {
    const comment = fileList[activeFileIndex].annState.annotations[0] ?? null
    act(() => root.render(
      <AnnotationPanel
        files={fileList} activeFileIndex={activeFileIndex} annotations={fileList[activeFileIndex].annState.annotations} blocks={[]}
        selectedAnnotationId={null} onSelect={() => {}} onOpenNote={() => {}} onEdit={() => {}} onDelete={() => {}}
        onExport={() => {}} onImport={() => {}} generalComment={comment}
        onSaveGeneralComment={onSave} generalDisabled={false} approves={false} collapsed={false}
      />
    ))
  }

  it('shows the active file\'s comment as a card, not the empty hint, and nothing for the other file', () => {
    const list = [withComment('a.md', 'About A'), withComment('b.md', null)]
    renderWith(list, 0)
    expect(host.querySelector('li.note-card').textContent).toContain('About A')
    expect(host.textContent).not.toContain('Every selection becomes')
    renderWith(list, 1)
    expect(host.querySelector('li.note-card')).toBeNull()
    expect(host.textContent).toContain('Every selection becomes')
  })

  it('deletes only through the active file\'s save', () => {
    const save = vi.fn()
    renderWith([withComment('a.md', 'About A'), withComment('b.md', null)], 0, save)
    act(() => host.querySelector('button[aria-label="Delete annotation"]').click())
    expect(save).toHaveBeenCalledWith('')
  })

  it('drops a draft opened from the card when the file changes', () => {
    const save = vi.fn()
    const list = [withComment('a.md', 'About A'), withComment('b.md', 'About B')]
    renderWith(list, 0, save)
    act(() => host.querySelector('button[aria-label="Edit annotation"]').click())
    expect(host.querySelector('textarea').value).toBe('About A')
    renderWith(list, 1, save)
    expect(host.querySelector('textarea')).toBeNull()
    expect(host.querySelector('li.note-card').textContent).toContain('About B')
    expect(save).not.toHaveBeenCalled()
  })
})
