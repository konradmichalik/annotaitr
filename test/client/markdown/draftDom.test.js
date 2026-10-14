// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import Highlighter from 'web-highlighter'
import { blockTexts, textAnchorMetas, reanchorToDom } from '../../../client/markdown/src/utils/viewerDom.js'

function render(html) {
  const host = document.createElement('article')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

afterEach(() => { document.body.innerHTML = '' })

const DOC = '<p data-block-id="block-0">Intro</p>' +
  '<p data-block-id="block-1">Hello <strong>bold</strong> world</p>' +
  '<div data-block-id="block-2"><div class="code-toolbar"><button>copy</button></div><pre><code>const a = 1</code></pre></div>'

const stale = { parentTagName: 'P', parentIndex: 7, textOffset: 99 }

describe('blockTexts', () => {
  it('lists each block with the text offsets count in, code from the code element', () => {
    const host = render(DOC)
    expect(blockTexts(host)).toEqual([
      { id: 'block-0', text: 'Intro' },
      { id: 'block-1', text: 'Hello bold world' },
      { id: 'block-2', text: 'const a = 1' }
    ])
  })
})

describe('textAnchorMetas', () => {
  it('returns the metas web-highlighter stores for the same range', () => {
    const host = render(DOC)
    const highlighter = new Highlighter({ $root: host, wrapTag: 'mark' })
    const block = host.querySelector('[data-block-id="block-1"]')
    const range = document.createRange()
    range.setStart(block.querySelector('strong').firstChild, 2)
    range.setEnd(block.lastChild, 4)
    const source = highlighter.fromRange(range)

    expect(source.text).toBe('ld wor')
    expect(textAnchorMetas(host, 'block-1', 8, 'ld wor')).toEqual({
      startMeta: { parentTagName: 'STRONG', parentIndex: 0, textOffset: 2 },
      endMeta: { parentTagName: 'P', parentIndex: 1, textOffset: 14 }
    })
    expect(textAnchorMetas(host, 'block-1', 8, 'ld wor')).toEqual({
      startMeta: { ...source.startMeta },
      endMeta: { ...source.endMeta }
    })
    highlighter.dispose()
  })

  it('runs on into the next block for a selection across blocks', () => {
    const host = render(DOC)
    expect(textAnchorMetas(host, 'block-0', 3, 'roHello')).toEqual({
      startMeta: { parentTagName: 'P', parentIndex: 0, textOffset: 3 },
      endMeta: { parentTagName: 'P', parentIndex: 1, textOffset: 5 }
    })
  })

  it('counts inside the code of a code block', () => {
    const host = render(DOC)
    expect(textAnchorMetas(host, 'block-2', 6, 'a')).toEqual({
      startMeta: { parentTagName: 'CODE', parentIndex: 0, textOffset: 6 },
      endMeta: { parentTagName: 'CODE', parentIndex: 0, textOffset: 7 }
    })
  })

  it('looks through existing highlight marks to the original parent', () => {
    const host = render('<p data-block-id="block-0">Hello <mark data-highlight-id="x">big</mark> world</p>')
    expect(textAnchorMetas(host, 'block-0', 10, 'world')).toEqual({
      startMeta: { parentTagName: 'P', parentIndex: 0, textOffset: 10 },
      endMeta: { parentTagName: 'P', parentIndex: 0, textOffset: 15 }
    })
  })

  it('is null when the block is missing or the text there differs', () => {
    const host = render(DOC)
    expect(textAnchorMetas(host, 'block-9', 0, 'I')).toBeNull()
    expect(textAnchorMetas(host, 'block-0', 0, 'Outro')).toBeNull()
    expect(textAnchorMetas(host, 'block-2', 6, 'a = 1 and more')).toBeNull()
  })
})

describe('reanchorToDom', () => {
  it('moves a text note with fresh metas and marks a vanished one unanchored', () => {
    const host = render(DOC)
    const moved = { id: 'a', type: 'COMMENT', blockId: 'block-0', startOffset: 0, endOffset: 4, originalText: 'bold', startMeta: stale, endMeta: stale }
    const gone = { id: 'b', type: 'COMMENT', blockId: 'block-1', startOffset: 0, endOffset: 4, originalText: 'gone', startMeta: stale, endMeta: stale }
    const [first, second] = reanchorToDom(host, [], [moved, gone])
    expect(first).toEqual({
      ...moved,
      blockId: 'block-1',
      startOffset: 6,
      endOffset: 10,
      startMeta: { parentTagName: 'STRONG', parentIndex: 0, textOffset: 0 },
      endMeta: { parentTagName: 'STRONG', parentIndex: 0, textOffset: 4 }
    })
    expect(second).toEqual({ ...gone, unanchored: true })
  })

  it('verifies element notes against the rendered blocks', () => {
    const host = render(
      '<p data-block-id="block-0">Intro</p>' +
      '<p data-block-id="block-1"><span class="annotatable-image-wrapper" data-image-src="a.png"></span></p>' +
      '<p data-block-id="block-2">See <a href="x">the docs</a></p>' +
      '<div data-block-id="block-3"><pre><code class="hljs"><span>const</span> a</code></pre></div>'
    )
    const parsed = [{ id: 'block-4', content: 'x^2' }]
    const el = (overrides) => ({ id: overrides.targetType, type: 'COMMENT', blockId: 'block-0', startOffset: 0, endOffset: 0, ...overrides })
    const result = reanchorToDom(host, parsed, [
      el({ targetType: 'image', imageSrc: 'a.png', originalText: '![](a.png)' }),
      el({ targetType: 'image', imageSrc: 'b.png', originalText: '![](b.png)' }),
      el({ targetType: 'link', originalText: 'the docs' }),
      el({ targetType: 'pinpoint', blockId: 'block-2', originalText: 'Intro' }),
      el({ targetType: 'math', originalText: 'x^2' }),
      el({ targetType: 'token', blockId: 'block-3', startOffset: 0, endOffset: 5, originalText: 'const' }),
      el({ targetType: 'token', blockId: 'block-3', startOffset: 6, endOffset: 7, originalText: 'a' })
    ])
    expect(result.map((ann) => [ann.targetType, ann.blockId, ann.unanchored ?? false])).toEqual([
      ['image', 'block-1', false],
      ['image', 'block-0', true],
      ['link', 'block-2', false],
      ['pinpoint', 'block-0', false],
      ['math', 'block-0', true],
      ['token', 'block-3', false],
      ['token', 'block-3', true]
    ])
  })
})
