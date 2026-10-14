// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useHighlighter } from '../../../client/markdown/src/hooks/useHighlighter.js'
import { filesReducer } from '../../../client/markdown/src/state/filesReducer.js'
import { noteNumbers } from '../../../client/markdown/src/utils/noteNumbers.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const blocks = [{ id: 'block-0', type: 'paragraph', content: 'Alpha beta gamma delta', startLine: 1 }]
const meta = (textOffset) => ({ parentTagName: 'P', parentIndex: 0, textOffset })
const note = (id, from, to, text, extra = {}) => ({
  id, type: 'COMMENT', text: `note ${id}`, blockId: 'block-0', startOffset: from, endOffset: to,
  originalText: text, startMeta: meta(from), endMeta: meta(to), ...extra
})

let host
let root
let methods

function Harness({ annotations, refreshAnchor }) {
  const { containerRef, highlightMethods } = useHighlighter({
    annotations, refreshAnchor, onAddAnnotation: () => {}, onEditAnnotation: () => {}, onDeleteAnnotation: () => {}, onSelectAnnotation: () => {}
  })
  methods = highlightMethods
  return <div ref={containerRef}><p data-block-id="block-0">Alpha beta gamma delta</p></div>
}

const badges = () => Object.fromEntries(
  [...host.querySelectorAll('[data-note-number]')].map((el) => [el.dataset.highlightId, Number(el.dataset.noteNumber)])
)

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('restored highlight numbers', () => {
  it('match the cards when notes without numbers or with colliding numbers are restored', () => {
    let files = filesReducer([], { type: 'INIT_FILES', files: [{ path: 'a.md', blocks }, { path: 'b.md', blocks }] })
    const other = [note('b1', 0, 5, 'Alpha', { number: 1 }), note('b2', 11, 16, 'gamma', { number: 2 })]
    const stored = [note('a1', 0, 5, 'Alpha', { number: 1 }), note('a2', 11, 16, 'gamma')]
    files = filesReducer(files, { type: 'ANN', fileIndex: 1, annAction: { type: 'RESTORE', annotations: other } })
    files = filesReducer(files, { type: 'ANN', fileIndex: 0, annAction: { type: 'RESTORE', annotations: stored } })
    const cards = Object.fromEntries(noteNumbers(files.map((f) => ({ annotations: f.annState.annotations }))))
    expect(cards.a1).not.toBe(1)

    act(() => root.render(<Harness annotations={files[0].annState.annotations} />))
    // The delayed restore is handed the objects as they came from the server or the file.
    act(() => methods.restoreHighlights(stored))

    expect(badges()).toEqual({ a1: cards.a1, a2: cards.a2 })
  })
})

describe('restored highlights with refreshAnchor', () => {
  it('leaves a note out when its block is not on the page, instead of using stale metas', () => {
    const stored = [note('a1', 0, 5, 'Alpha', { number: 1 })]
    act(() => root.render(<Harness annotations={stored} refreshAnchor={() => null} />))
    act(() => methods.restoreHighlights(stored))
    expect(host.querySelectorAll('[data-highlight-id]')).toHaveLength(0)
  })

  it('places a note at the metas refreshAnchor finds', () => {
    const stored = [note('a1', 0, 5, 'Alpha', { number: 1 })]
    const refreshAnchor = () => ({ startMeta: meta(11), endMeta: meta(16) })
    act(() => root.render(<Harness annotations={stored} refreshAnchor={refreshAnchor} />))
    act(() => methods.restoreHighlights(stored))
    expect([...host.querySelectorAll('[data-highlight-id="a1"]')].map((el) => el.textContent).join('')).toBe('gamma')
  })
})
