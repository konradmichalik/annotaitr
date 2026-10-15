// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useFullDiffs } from '../../../client/markdown/src/hooks/useFullDiffs.js'
import { useReadViews } from '../../../client/markdown/src/hooks/useReadViews.js'
import { useChangesReview } from '../../../client/markdown/src/hooks/useChangesReview.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const DIFF = ['@@ -1 +1,3 @@', ' # Doc', '+', '+New text.'].join('\n')

/** A fetch whose answers the test hands out one by one, by path. */
function controlledFetch() {
  const calls = []
  const fetch = vi.fn((url) => new Promise((resolve) => {
    const path = decodeURIComponent(url.split('path=')[1])
    calls.push({ path, answer: (body) => resolve({ json: async () => body }) })
  }))
  const answer = async (path, body) => {
    const call = calls.find((c) => c.path === path && !c.done)
    call.done = true
    await act(async () => { call.answer(body) })
  }
  return { fetch, calls, answer, ok: (path) => answer(path, { success: true, data: { diff: DIFF } }), fail: (path) => answer(path, { success: false, error: 'Not found' }) }
}

const latest = {}
let root = null

function render(Component, props) {
  root = createRoot(document.createElement('div'))
  act(() => root.render(<Component {...props} />))
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  vi.unstubAllGlobals()
})

function FullHarness() {
  latest.full = useFullDiffs()
  return null
}

describe('useFullDiffs', () => {
  it('asks once for two requests in the same tick', async () => {
    const net = controlledFetch()
    vi.stubGlobal('fetch', net.fetch)
    render(FullHarness)
    act(() => { latest.full.load('a.md'); latest.full.load('a.md') })
    expect(net.fetch).toHaveBeenCalledTimes(1)
    expect(latest.full.entries.get('a.md').loading).toBe(true)
    await net.ok('a.md')
    expect(latest.full.entries.get('a.md')).toEqual({ loading: false, diff: DIFF, error: null })
  })

  it('keeps a failed load and asks again on the next request', async () => {
    const net = controlledFetch()
    vi.stubGlobal('fetch', net.fetch)
    render(FullHarness)
    act(() => { latest.full.load('a.md') })
    await net.fail('a.md')
    expect(latest.full.entries.get('a.md').error).toBe('The whole file is not available.')
    act(() => { latest.full.load('a.md') })
    expect(net.fetch).toHaveBeenCalledTimes(2)
  })

  it('names a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    render(FullHarness)
    await act(async () => { await latest.full.load('a.md') })
    expect(latest.full.entries.get('a.md').error).toBe('Could not load the whole file.')
  })

  it('loads at most three files at once', async () => {
    const net = controlledFetch()
    vi.stubGlobal('fetch', net.fetch)
    render(FullHarness)
    act(() => { ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'].forEach((path) => latest.full.load(path)) })
    await act(async () => {})
    expect(net.calls.map((c) => c.path)).toEqual(['a.md', 'b.md', 'c.md'])
    expect(latest.full.entries.get('e.md').loading).toBe(true)
    await net.ok('b.md')
    expect(net.calls.map((c) => c.path)).toEqual(['a.md', 'b.md', 'c.md', 'd.md'])
  })
})

const card = (path, extra = {}) => ({
  path, status: 'M', hasDiff: true,
  heading: { id: `h-${path}`, startLine: 1 },
  blocks: [{ id: `why-${path}`, type: 'paragraph', startLine: 2 }, { id: `diff-${path}`, type: 'code', language: 'diff', startLine: 3 }],
  ...extra
})
const SECTIONS = { files: [card('a.md'), card('b.md'), card('c.js')] }

function ReadHarness({ defaultView = 'diff', picks = [] }) {
  latest.review = useChangesReview({ defaultView, onPickView: (view) => picks.push(view) })
  latest.read = useReadViews({ sections: SECTIONS, review: latest.review })
  return null
}

function renderRead(props = {}) {
  const net = controlledFetch()
  vi.stubGlobal('fetch', net.fetch)
  const picks = []
  render(ReadHarness, { picks, ...props })
  return { net, picks }
}

const fileOf = (path) => SECTIONS.files.find((f) => f.path === path)

describe('useReadViews', () => {
  it('shows Read once the file has loaded and only then stores it as the default', async () => {
    const { net, picks } = renderRead()
    act(() => latest.read.pick('a.md', 'read'))
    expect(picks).toEqual([])
    expect(latest.read.viewOf(fileOf('a.md'))).toBe('read')
    await net.ok('a.md')
    expect(picks).toEqual(['read'])
    expect(latest.read.byPath.get('a.md')[0].id).toBe('read:a.md:block-0')
  })

  it('stays on Diff when the file cannot be loaded, says so and keeps the default', async () => {
    const { net, picks } = renderRead()
    act(() => latest.read.pick('a.md', 'read'))
    await net.fail('a.md')
    expect(latest.read.viewOf(fileOf('a.md'))).toBe('diff')
    expect(latest.read.statusOf(fileOf('a.md'))).toBe('The whole file is not available. The diff stays.')
    expect(picks).toEqual([])
    // P on a file that failed asks again.
    act(() => { latest.read.cycle('a.md') })
    expect(net.fetch).toHaveBeenCalledTimes(2)
    expect(latest.read.statusOf(fileOf('a.md'))).toBe('Loading the file to read…')
  })

  it('loads the files that open in Read by default, and leaves a failed one on Diff', async () => {
    const { net, picks } = renderRead({ defaultView: 'read' })
    await act(async () => {})
    expect(net.calls.map((c) => c.path)).toEqual(['a.md', 'b.md'])
    await net.ok('a.md')
    await net.fail('b.md')
    expect(latest.read.viewOf(fileOf('a.md'))).toBe('read')
    expect(latest.read.viewOf(fileOf('b.md'))).toBe('diff')
    expect(picks).toEqual([])
  })

  it('cycles a markdown file and ignores any other', async () => {
    const { picks } = renderRead()
    expect(latest.read.cycle('c.js')).toBe(false)
    let handled
    act(() => { handled = latest.read.cycle('a.md') })
    expect(handled).toBe(true)
    expect(latest.read.viewOf(fileOf('a.md'))).toBe('read')
    act(() => { latest.read.cycle('a.md') })
    expect(latest.read.viewOf(fileOf('a.md'))).toBe('changes')
    act(() => { latest.read.cycle('a.md') })
    expect(latest.read.viewOf(fileOf('a.md'))).toBe('diff')
    expect(picks).toEqual(['diff'])
  })

  it('shows Changes once the file has loaded, stores it as the default then, and builds its entries', async () => {
    const { net, picks } = renderRead()
    act(() => latest.read.pick('a.md', 'changes'))
    expect(latest.read.statusOf(fileOf('a.md'))).toBe('Loading the file to read…')
    await net.ok('a.md')
    expect(latest.read.viewOf(fileOf('a.md'))).toBe('changes')
    expect(picks).toEqual(['changes'])
    expect(latest.read.changesByPath.get('a.md').map((e) => e.change)).toEqual(['same', 'added'])
    expect(latest.read.blocks.map((b) => b.id)).toEqual(['read:a.md:block-0', 'read:a.md:block-1', 'old:a.md:block-0'])
  })

  it('reveals a note on the old file by opening Changes, and keeps Changes for a note on the new one', async () => {
    const { net, picks } = renderRead()
    let changed
    act(() => { changed = latest.read.reveal({ blockId: 'old:a.md:block-0' }) })
    expect(changed).toBe(true)
    expect(latest.read.viewOf(fileOf('a.md'))).toBe('changes')
    await net.ok('a.md')
    expect(latest.read.reveal({ blockId: 'read:a.md:block-1' })).toBe(false)
    expect(latest.read.viewOf(fileOf('a.md'))).toBe('changes')
    expect(picks).toEqual([])
  })

  it('reveals a Read note by opening its card on Read, without storing the view', async () => {
    const { net, picks } = renderRead()
    act(() => latest.review.toggle('a.md'))
    let changed
    act(() => { changed = latest.read.reveal({ blockId: 'read:a.md:block-1' }) })
    expect(changed).toBe(true)
    expect(latest.review.collapsed.has('a.md')).toBe(false)
    expect(latest.read.viewOf(fileOf('a.md'))).toBe('read')
    await net.ok('a.md')
    expect(picks).toEqual([])
    expect(latest.read.reveal({ blockId: 'read:a.md:block-1' })).toBe(false)
  })

  it('reveals a note on the hunks of a card on Read or Whole file by going back to the diff', async () => {
    const { net, picks } = renderRead()
    act(() => latest.read.pick('a.md', 'read'))
    await net.ok('a.md')
    act(() => latest.read.toggleWhole('b.md'))
    let changed
    act(() => { changed = latest.read.reveal({ blockId: 'diff-a.md' }) })
    expect(changed).toBe(true)
    expect(latest.read.viewOf(fileOf('a.md'))).toBe('diff')
    act(() => { changed = latest.read.reveal({ blockId: 'diff-b.md' }) })
    expect(changed).toBe(true)
    expect(latest.read.whole.has('b.md')).toBe(false)
    // The explanation stays visible on Read, so a note there changes nothing.
    await act(async () => latest.read.pick('a.md', 'read'))
    expect(latest.read.reveal({ blockId: 'why-a.md' })).toBe(false)
    expect(picks).toEqual(['read', 'read'])
  })

  it('keeps a failed Whole file load when it closes, so Read does not wait on it', async () => {
    const { net } = renderRead()
    act(() => latest.read.toggleWhole('a.md'))
    await net.fail('a.md')
    act(() => latest.read.toggleWhole('a.md'))
    expect(latest.read.whole.has('a.md')).toBe(false)
    act(() => latest.read.pick('a.md', 'read'))
    expect(net.fetch).toHaveBeenCalledTimes(2)
    await net.ok('a.md')
    expect(latest.read.viewOf(fileOf('a.md'))).toBe('read')
  })

  it('settles once every Read view the notes sit in has loaded or failed', async () => {
    const { net } = renderRead()
    const notes = [{ blockId: 'read:a.md:block-0' }, { blockId: 'read:b.md:block-0' }, { blockId: 'why-a.md' }]
    let settled
    act(() => { settled = latest.read.settle(notes) })
    expect(settled).toBe(false)
    expect(net.calls.map((c) => c.path)).toEqual(['a.md', 'b.md'])
    await net.ok('a.md')
    await net.fail('b.md')
    expect(latest.read.settle(notes)).toBe(true)
  })

  it('keeps the parsed blocks of a file while other files load', async () => {
    const { net } = renderRead()
    act(() => latest.read.pick('a.md', 'read'))
    await net.ok('a.md')
    const before = latest.read.byPath.get('a.md')
    act(() => latest.read.pick('b.md', 'read'))
    await net.ok('b.md')
    expect(latest.read.byPath.get('a.md')).toBe(before)
  })
})
