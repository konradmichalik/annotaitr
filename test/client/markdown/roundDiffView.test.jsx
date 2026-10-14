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
const AFTER = '# Plan\n\nKeep this.\n\nNew step.\n\nA new ending.\n'
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
  const mixed = roundDiffOf({ content: 'A2.\n\nC.\n\nD.\n', blocks: parseMarkdownToBlocks('A2.\n\nC.\n\nD.\n'), previousRound: { round: 1, content: 'A.\n\nB.\n\nC.\n' }, kind: 'document' })
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

describe('RoundDiffView', () => {
  it('marks added and changed blocks and strikes the removed and earlier ones, named for screen readers', () => {
    render(<RoundDiffView diff={diffed} />)
    const entries = [...host.querySelectorAll('.round-change')]
    expect(entries.map((e) => e.className)).toEqual(['round-change round-change--changed', 'round-change round-change--changed'])
    expect(entries.map((e) => e.querySelector('.round-change-sign').textContent)).toEqual(['±', '±'])
    expect(entries.map((e) => e.querySelector('.visually-hidden').textContent)).toEqual(['Changed since round 1', 'Changed since round 1'])
    expect(entries[0].querySelector('.round-change-before').textContent).toBe('Before:Old step.')
    expect(entries[0].querySelector('.round-change-after').textContent).toBe('New step.')
    expect(host.querySelector('.viewer-article').getAttribute('aria-label')).toBe('Changes since round 1')
  })

  it('renders added and removed blocks with their own sign and label, unchanged ones plain', () => {
    const before = '# Plan\n\nGone.\n\nStays.\n'
    const after = '# Plan\n\nStays.\n\nFresh.\n'
    render(<RoundDiffView diff={roundDiffOf({ content: after, blocks: parseMarkdownToBlocks(after), previousRound: { round: 2, content: before }, kind: 'document' })} />)
    const entries = [...host.querySelectorAll('.round-change')]
    expect(entries.map((e) => [e.className, e.querySelector('.round-change-sign').textContent, e.querySelector('.visually-hidden').textContent, e.querySelector('.round-change-body').textContent]))
      .toEqual([
        ['round-change round-change--removed', '−', 'Removed since round 2', 'Removed since round 2Gone.'],
        ['round-change round-change--added', '+', 'Added since round 2', 'Added since round 2Fresh.']
      ])
    expect(host.querySelector('[data-block-id="block-0"]').closest('.round-change')).toBeNull()
    expect(host.querySelector('[data-block-id="earlier-block-1"]').closest('.round-change--removed')).not.toBeNull()
  })
})
