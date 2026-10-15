// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { RenderedView } from '../../../client/markdown/src/components/Viewer/RenderedView.jsx'
import { diffBlocks } from '../../../client/markdown/src/utils/roundDiff.js'
import { parseMarkdownToBlocks } from '../../../client/markdown/src/utils/parser.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const OLD = '# Doc\n\nA.\n\nB.\n\nC.\n\nD.\n\nOld para here.\n\nGone block.\n'
const NEW = '# Doc\n\nA.\n\nB.\n\nC.\n\nD.\n\nNew para here.\n\nFresh one.\n'
const tagged = (text, prefix, extra = {}) => parseMarkdownToBlocks(text).map((b) => ({ ...b, id: `${prefix}${b.id}`, path: 'a.md', sortLine: 3, ...extra }))
const ENTRIES = diffBlocks(tagged(OLD, 'old:a.md:', { side: 'old' }), tagged(NEW, 'read:a.md:'))
const BLOCK_PROPS = { annotated: { annotatedImages: new Map(), annotatedDiagramBlocks: new Map(), annotatedMathBlocks: new Map(), noteBlockIds: new Map() }, handlers: {} }

let host
let root
function render(props) {
  act(() => root.render(<RenderedView entries={ENTRIES} noted={new Set()} hidden={false} blockProps={BLOCK_PROPS} {...props} />))
}
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})
function mount(props) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  render(props)
}

const block = (id) => host.querySelector(`[data-block-id="${id}"]`)
const shown = (el) => !el.closest('[hidden]')
const fold = () => host.querySelector('.change-fold')

describe('RenderedView on Changes', () => {
  it('marks added, removed and changed blocks with sign, ins or del and a label for screen readers', () => {
    mount({ view: 'changes' })
    const marks = [...host.querySelectorAll('.round-change')]
    expect(marks.map((m) => [m.className, m.querySelector('.round-change-sign').textContent, m.textContent.replace(/^[±+−]/, '')])).toEqual([
      ['round-change round-change--changed', '±', 'Changed, before: Old para here.Now: New para here.'],
      ['round-change round-change--removed', '−', 'Removed: Gone block.'],
      ['round-change round-change--added', '+', 'Added: Fresh one.']
    ])
    expect(block('old:a.md:block-6').closest('del')).not.toBeNull()
    expect(block('read:a.md:block-6').closest('ins')).not.toBeNull()
  })

  it('folds the unchanged run before the changes behind a button, keeping one block of context', () => {
    mount({ view: 'changes' })
    expect(fold().getAttribute('type')).toBe('button')
    expect(fold().getAttribute('aria-expanded')).toBe('false')
    expect(fold().textContent).toBe('4 unchanged blocks')
    expect(['read:a.md:block-0', 'read:a.md:block-3'].map((id) => shown(block(id)))).toEqual([false, false])
    expect(shown(block('read:a.md:block-4'))).toBe(true)
    act(() => fold().click())
    expect(fold().getAttribute('aria-expanded')).toBe('true')
    expect(shown(block('read:a.md:block-0'))).toBe(true)
  })

  it('keeps an opened fold open when the entries are rebuilt', () => {
    mount({ view: 'changes' })
    act(() => fold().click())
    render({ view: 'changes', entries: diffBlocks(tagged(OLD, 'old:a.md:', { side: 'old' }), tagged(NEW, 'read:a.md:')) })
    expect(fold().getAttribute('aria-expanded')).toBe('true')
  })

  it('switches off what is hidden for the highlighter: folded and removed entries, the old half and the sign', () => {
    mount({ view: 'read' })
    const off = [...host.querySelectorAll('.is-off')]
    expect(off.every((el) => el.hasAttribute('hidden'))).toBe(true)
    expect(block('old:a.md:block-5').closest('.is-off')).not.toBeNull()
    expect(host.querySelector('.change-read.is-off')).toBeNull()
    expect([...host.querySelectorAll('.round-change-sign')].every((sign) => sign.classList.contains('is-off'))).toBe(true)
    expect(host.querySelector('.round-change-before').classList.contains('is-off')).toBe(true)
    render({ view: 'changes' })
    expect(host.querySelector('.round-change-sign').classList.contains('is-off')).toBe(false)
    expect(host.querySelector('.round-change-before').classList.contains('is-off')).toBe(false)
    expect(fold().querySelector('.is-off')).toBeNull()
    expect(block('read:a.md:block-0').closest('.is-off')).not.toBeNull()
    act(() => fold().click())
    expect(block('read:a.md:block-0').closest('.is-off')).toBeNull()
  })

  it('does not fold a run that holds a note', () => {
    mount({ view: 'changes', noted: new Set(['read:a.md:block-1']) })
    expect(fold()).toBeNull()
  })

  it('renders the old headings without heading semantics', () => {
    mount({ view: 'changes', entries: diffBlocks(tagged('# Old title\n', 'old:a.md:', { side: 'old' }), tagged('# New title\n', 'read:a.md:')) })
    expect([...host.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['New title'])
  })
})

describe('RenderedView on Read', () => {
  it('leaves the whole view switchable for restores while Diff hides it', () => {
    mount({ view: 'read', hidden: true })
    expect(host.querySelector('.change-read').hasAttribute('hidden')).toBe(true)
    expect(host.querySelector('.change-read').classList.contains('is-off')).toBe(false)
  })

  it('shows the new file only: no signs, labels, folds or old blocks', () => {
    mount({ view: 'read' })
    expect(fold()).toBeNull()
    expect(host.querySelectorAll('.round-change')).toHaveLength(0)
    expect(host.querySelectorAll('.visually-hidden')).toHaveLength(0)
    expect(shown(block('old:a.md:block-5'))).toBe(false)
    expect(shown(block('old:a.md:block-6'))).toBe(false)
    expect([...host.querySelectorAll('[data-block-id^="read:"]')].every(shown)).toBe(true)
    expect([...host.querySelectorAll('.round-change-sign')].every((sign) => !shown(sign))).toBe(true)
  })

  it('keeps the same elements when switching to Changes, so highlights in them stay', () => {
    mount({ view: 'read' })
    const before = block('read:a.md:block-6')
    render({ view: 'changes' })
    expect(block('read:a.md:block-6')).toBe(before)
    render({ view: 'read' })
    expect(block('read:a.md:block-6')).toBe(before)
  })
})
