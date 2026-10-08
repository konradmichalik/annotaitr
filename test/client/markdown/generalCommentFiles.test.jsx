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
