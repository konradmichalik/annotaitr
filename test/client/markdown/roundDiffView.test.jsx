// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { RoundDiffBar } from '../../../client/markdown/src/components/RoundDiffBar.jsx'
import { RoundDiffView } from '../../../client/markdown/src/components/Viewer/RoundDiffView.jsx'
import { roundDiffOf } from '../../../client/markdown/src/utils/roundDiff.js'
import { parseMarkdownToBlocks } from '../../../client/markdown/src/utils/parser.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const BEFORE = '# Plan\n\nKeep this.\n\nOld step.\n\nDrop this.\n'
const AFTER = '# Plan\n\nKeep this.\n\nNew step.\n\nDrop this now.\n'
const diffed = roundDiffOf({ content: AFTER, blocks: parseMarkdownToBlocks(AFTER), previousRound: { round: 1, content: BEFORE }, kind: 'document' })

let host
let root
function render(element) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(element))
}
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('RoundDiffBar', () => {
  const mixed = roundDiffOf({ content: 'Alpha one again.\n\nC.\n\nD.\n', blocks: parseMarkdownToBlocks('Alpha one again.\n\nC.\n\nD.\n'), previousRound: { round: 1, content: 'Alpha one.\n\nB.\n\nC.\n' }, kind: 'document' })
  const toggle = () => host.querySelector('button')

  it('offers the changes view as a toggle naming the round, with what changed', () => {
    const onToggle = vi.fn()
    render(<RoundDiffBar diff={mixed} active={false} onToggle={onToggle} />)
    expect(toggle().getAttribute('type')).toBe('button')
    expect(toggle().textContent).toBe('Changes since round 1')
    expect(toggle().getAttribute('aria-pressed')).toBe('false')
    expect(host.querySelector('.round-diff-counts').textContent).toBe('+1 added · ±1 changed · −1 removed')
    expect(host.querySelector('.round-diff-hint')).toBeNull()
    act(() => toggle().click())
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('says that notes go on the normal view while the changes show', () => {
    const onToggle = vi.fn()
    render(<RoundDiffBar diff={mixed} active onToggle={onToggle} />)
    expect(toggle().getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('.round-diff-hint').textContent).toBe('Read only. Turn it off to add notes.')
    act(() => toggle().click())
    expect(onToggle).toHaveBeenCalledWith(false)
  })
})

const diffOf = (before, after, round = 1) => roundDiffOf({ content: after, blocks: parseMarkdownToBlocks(after), previousRound: { round, content: before }, kind: 'document' })

describe('RoundDiffView', () => {
  it('marks a changed block with its earlier version deleted and its new one inserted, named for screen readers', () => {
    render(<RoundDiffView diff={diffed} />)
    const entries = [...host.querySelectorAll('.round-change')]
    expect(entries.map((e) => e.className)).toEqual(['round-change round-change--changed', 'round-change round-change--changed'])
    expect(entries.map((e) => e.querySelector('.round-change-sign').textContent)).toEqual(['±', '±'])
    const before = entries[0].querySelector('.round-change-before')
    const after = entries[0].querySelector('.round-change-after')
    expect([before.tagName, after.tagName]).toEqual(['DEL', 'INS'])
    expect(before.firstElementChild.className).toBe('visually-hidden')
    expect(before.textContent).toBe('Changed since round 1, before: Old step.')
    expect(after.textContent).toBe('Now: New step.')
    expect(host.querySelector('.viewer-article').getAttribute('aria-label')).toBe('Changes since round 1')
  })

  it('inserts added blocks and deletes removed ones with their own sign and label, unchanged ones plain', () => {
    render(<RoundDiffView diff={diffOf('# Plan\n\nGone.\n\nStays.\n', '# Plan\n\nStays.\n\nFresh.\n', 2)} />)
    const entries = [...host.querySelectorAll('.round-change')]
    expect(entries.map((e) => [e.className, e.querySelector('.round-change-sign').textContent, e.querySelector('.round-change-body').tagName, e.querySelector('.round-change-body').textContent]))
      .toEqual([
        ['round-change round-change--removed', '−', 'DEL', 'Removed since round 2: Gone.'],
        ['round-change round-change--added', '+', 'INS', 'Added since round 2: Fresh.']
      ])
    expect(host.querySelector('[data-block-id="block-0"]').closest('.round-change')).toBeNull()
    expect(host.querySelector('[data-block-id="earlier-block-1"]').closest('.round-change--removed')).not.toBeNull()
  })

  it('renders earlier headings without heading semantics or ids, so navigation lands on the current ones', () => {
    render(<RoundDiffView diff={diffOf('# Old title\n\n## Gone section\n\nText.\n', '# New title\n\nText.\n')} />)
    expect([...host.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => [h.tagName, h.id, h.textContent])).toEqual([['H1', 'new-title', 'New title']])
    const earlier = [...host.querySelectorAll('del .heading')]
    expect(earlier.map((h) => [h.tagName, h.hasAttribute('id'), h.textContent])).toEqual([['P', false, 'Old title'], ['P', false, 'Gone section']])
  })

  it('offers no annotate control on tables, formulas or images', () => {
    const after = '| a | b |\n|---|---|\n| 1 | 2 |\n\n$$\nx^2\n$$\n\n![Logo](logo.png)\n'
    render(<RoundDiffView diff={diffOf('Intro.\n', after)} />)
    expect(host.querySelector('.block-table')).not.toBeNull()
    expect(host.querySelector('.block-math')).not.toBeNull()
    expect(host.querySelector('img').getAttribute('alt')).toBe('Logo')
    expect(host.querySelector('.table-toolbar-btn--annotate')).toBeNull()
    expect(host.querySelectorAll('[role="button"], [tabindex]')).toHaveLength(0)
  })
})
