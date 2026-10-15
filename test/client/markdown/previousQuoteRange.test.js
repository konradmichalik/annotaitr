// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { previousQuoteRange } from '../../../client/markdown/src/utils/viewerDom.js'

function render(html) {
  const host = document.createElement('article')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

const thread = (anchor, annotation, place) => ({ handle: 'a3f19c2e', anchor, annotation, place })
const comment = (extra) => ({ id: 'x', type: 'COMMENT', blockId: 'block-1', startOffset: 4, originalText: 'intro says', ...extra })

afterEach(() => { document.body.innerHTML = '' })

describe('previousQuoteRange', () => {
  const blocks = [{ id: 'block-0', startLine: 1 }, { id: 'block-1', startLine: 3 }, { id: 'block-2', startLine: 5 }]

  it('uses the stored offsets of an exact thread when they still hold the quote', () => {
    const host = render('<h1 data-block-id="block-0">Title</h1><p data-block-id="block-1">The intro says hello.</p>')
    const range = previousQuoteRange(host, blocks, thread('exact', comment(), { line: 3, quote: 'intro says' }))
    expect(range.toString()).toBe('intro says')
  })

  it('finds a moved quote in the block at its new line, across inline markup', () => {
    const host = render('<h1 data-block-id="block-0">Title</h1><p data-block-id="block-1">New.</p><p data-block-id="block-2">The <strong>intro</strong> says hello.</p>')
    const range = previousQuoteRange(host, blocks, thread('moved', comment(), { line: 5, quote: 'intro says' }))
    expect(range.toString()).toBe('intro says')
  })

  it('has no range for an orphan, a general comment, an insertion or text it cannot find', () => {
    const host = render('<p data-block-id="block-1">The intro says hello.</p>')
    expect(previousQuoteRange(host, blocks, thread('orphan', comment(), null))).toBeNull()
    expect(previousQuoteRange(host, blocks, thread('exact', comment({ targetType: 'global' }), null))).toBeNull()
    expect(previousQuoteRange(host, blocks, thread('exact', comment({ type: 'INSERTION' }), { line: 3, quote: 'x' }))).toBeNull()
    expect(previousQuoteRange(host, blocks, thread('moved', comment(), { line: 3, quote: 'not here' }))).toBeNull()
  })
})
