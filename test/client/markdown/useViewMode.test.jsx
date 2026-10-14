// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useViewMode } from '../../../client/markdown/src/hooks/useViewMode.js'
import { useRoundDiff } from '../../../client/markdown/src/hooks/useRoundDiff.js'
import { parseMarkdownToBlocks } from '../../../client/markdown/src/utils/parser.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host
let root
let latest
function Probe({ hook, args }) {
  latest = hook(...args)
  return null
}
function render(hook, args) {
  act(() => root.render(<Probe hook={hook} args={args} />))
}
function mount() {
  host = document.createElement('div')
  root = createRoot(host)
}
afterEach(() => act(() => root.unmount()))

describe('useViewMode', () => {
  it('leaves the changes view for the preview when another file opens, and keeps preview and source', () => {
    mount()
    render(useViewMode, [0])
    expect(latest[0]).toBe('preview')
    act(() => latest[1]('changes'))
    expect(latest[0]).toBe('changes')
    render(useViewMode, [1])
    expect(latest[0]).toBe('preview')
    act(() => latest[1]('source'))
    render(useViewMode, [0])
    expect(latest[0]).toBe('source')
  })
})

describe('useRoundDiff', () => {
  const file = (content, previous) => ({ content, blocks: parseMarkdownToBlocks(content), previousRound: previous, kind: 'document', isPlainText: false })

  it('diffs the active file once and again only when its blocks or last round change', () => {
    mount()
    const current = file('# Plan\n\nStep two.\n', { round: 1, content: '# Plan\n\nStep one.\n' })
    render(useRoundDiff, [current])
    const first = latest
    expect(first.counts).toEqual({ added: 0, changed: 1, removed: 0 })
    render(useRoundDiff, [{ ...current, annState: { annotations: [1] } }])
    expect(latest).toBe(first)
    render(useRoundDiff, [file('# Plan\n\nStep three.\n', current.previousRound)])
    expect(latest).not.toBe(first)
    render(useRoundDiff, [null])
    expect(latest).toBeNull()
  })
})
