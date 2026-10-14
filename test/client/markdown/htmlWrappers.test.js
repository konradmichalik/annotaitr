import { describe, it, expect } from 'vitest'
import { groupHtmlWrappers, parseHtmlAttributes, isWrapperTag } from '../../../client/markdown/src/utils/htmlWrappers.js'
import { parseMarkdownToBlocks } from '../../../client/markdown/src/utils/parser.js'

const b = (props) => ({ type: 'html', ...props })

describe('groupHtmlWrappers', () => {
  it('keeps plain blocks flat', () => {
    const blocks = [{ id: 'a', type: 'paragraph' }, { id: 'b', type: 'heading' }]
    expect(groupHtmlWrappers(blocks)).toEqual([
      { kind: 'block', block: blocks[0] },
      { kind: 'block', block: blocks[1] }
    ])
  })

  it('nests the blocks between an open and a close marker', () => {
    const open = b({ id: 'o', htmlTag: 'details', htmlRole: 'open' })
    const inner = { id: 'i', type: 'paragraph' }
    const close = b({ id: 'c', htmlTag: 'details', htmlRole: 'close' })
    const nodes = groupHtmlWrappers([open, inner, close])
    expect(nodes).toHaveLength(1)
    expect(nodes[0].kind).toBe('wrapper')
    expect(nodes[0].block).toBe(open)
    expect(nodes[0].children).toEqual([{ kind: 'block', block: inner }])
  })

  it('nests wrappers inside wrappers', () => {
    const blocks = [
      b({ id: 'o1', htmlTag: 'div', htmlRole: 'open' }),
      b({ id: 'o2', htmlTag: 'details', htmlRole: 'open' }),
      { id: 'i', type: 'paragraph' },
      b({ id: 'c2', htmlTag: 'details', htmlRole: 'close' }),
      b({ id: 'c1', htmlTag: 'div', htmlRole: 'close' })
    ]
    const nodes = groupHtmlWrappers(blocks)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].children).toHaveLength(1)
    expect(nodes[0].children[0].kind).toBe('wrapper')
    expect(nodes[0].children[0].children).toEqual([{ kind: 'block', block: blocks[2] }])
  })

  it('renders a close marker without a matching open as a plain block', () => {
    const close = b({ id: 'c', htmlTag: 'div', htmlRole: 'close' })
    expect(groupHtmlWrappers([close])).toEqual([{ kind: 'block', block: close }])
  })

  it('keeps a mismatched close marker as a plain block', () => {
    const open = b({ id: 'o', htmlTag: 'div', htmlRole: 'open' })
    const close = b({ id: 'c', htmlTag: 'section', htmlRole: 'close' })
    const nodes = groupHtmlWrappers([open, close])
    expect(nodes[0].kind).toBe('wrapper')
    expect(nodes[0].children).toEqual([{ kind: 'block', block: close }])
  })

  it('groups a parsed accordion into one wrapper with the summary first', () => {
    const blocks = parseMarkdownToBlocks('<details>\n<summary>Click me</summary>\n\nHidden\n\n</details>')
    const nodes = groupHtmlWrappers(blocks)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].block.htmlTag).toBe('details')
    expect(nodes[0].children[0].block).toMatchObject({ htmlRole: 'summary', content: 'Click me' })
    expect(nodes[0].children[1].block).toMatchObject({ type: 'paragraph', content: 'Hidden' })
  })
})

describe('groupHtmlWrappers with quotes', () => {
  it('nests the children of a quote under it by parentId', () => {
    const quote = { id: 'q', type: 'blockquote', nested: true }
    const child = { id: 'c', type: 'code', parentId: 'q' }
    const after = { id: 'a', type: 'paragraph' }
    expect(groupHtmlWrappers([quote, child, after])).toEqual([
      { kind: 'quote', block: quote, children: [{ kind: 'block', block: child }] },
      { kind: 'block', block: after }
    ])
  })

  it('keeps a child whose quote is not in the list at the top level', () => {
    const child = { id: 'c', type: 'list-item', parentId: 'q' }
    expect(groupHtmlWrappers([child])).toEqual([{ kind: 'block', block: child }])
  })

  it('nests a quote in a quote and a wrapper in a quote', () => {
    const nodes = groupHtmlWrappers(parseMarkdownToBlocks('> Outer\n>\n> > Inner\n> > - x\n>\n> <details>\n>\n> Hidden\n>\n> </details>'))
    expect(nodes).toHaveLength(1)
    expect(nodes[0].kind).toBe('quote')
    expect(nodes[0].children.map((n) => n.kind)).toEqual(['block', 'quote', 'wrapper'])
    expect(nodes[0].children[1].children.map((n) => n.block.content)).toEqual(['Inner', 'x'])
    expect(nodes[0].children[2].children.map((n) => n.block.content)).toEqual(['Hidden'])
  })

  it('nests a quote inside an HTML wrapper', () => {
    const nodes = groupHtmlWrappers(parseMarkdownToBlocks('<div>\n\n> - a\n\nAfter\n\n</div>'))
    expect(nodes).toHaveLength(1)
    expect(nodes[0].children.map((n) => n.kind)).toEqual(['quote', 'block'])
    expect(nodes[0].children[0].children.map((n) => n.block.content)).toEqual(['a'])
    expect(nodes[0].children[1].block.content).toBe('After')
  })
})

describe('parseHtmlAttributes', () => {
  it('reads double-quoted attributes', () => {
    expect(parseHtmlAttributes('<div align="center">')).toEqual({ align: 'center' })
  })

  it('reads single-quoted attributes', () => {
    expect(parseHtmlAttributes("<div align='center'>")).toEqual({ align: 'center' })
  })

  it('maps class to className', () => {
    expect(parseHtmlAttributes('<div class="a b">')).toEqual({ className: 'a b' })
  })

  it('treats a bare boolean attribute as true', () => {
    expect(parseHtmlAttributes('<details open>')).toEqual({ open: true })
  })

  it('treats any present open attribute as true', () => {
    // HTML boolean attributes are on by presence: <details open="false"> is open
    expect(parseHtmlAttributes('<details open="">')).toEqual({ open: true })
    expect(parseHtmlAttributes('<details open="false">')).toEqual({ open: true })
    expect(parseHtmlAttributes('<details open="0">')).toEqual({ open: true })
    expect(parseHtmlAttributes('<details open=open>')).toEqual({ open: true })
  })

  it('drops attributes outside the allowlist', () => {
    expect(parseHtmlAttributes('<div style="color:red" onclick="x()" data-x="1">')).toEqual({})
  })

  it('returns an empty object for a bare tag', () => {
    expect(parseHtmlAttributes('<div>')).toEqual({})
  })
})

describe('isWrapperTag', () => {
  it('accepts mixed-content tags', () => {
    expect(isWrapperTag('details')).toBe(true)
    expect(isWrapperTag('div')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isWrapperTag('script')).toBe(false)
    expect(isWrapperTag(undefined)).toBe(false)
  })
})

describe('groupHtmlWrappers with trailing content', () => {
  it('keeps a block that follows the closing tag outside the wrapper', () => {
    const blocks = parseMarkdownToBlocks('<details>\n<summary>S</summary>\nBody\n</details>After the accordion.')
    const nodes = groupHtmlWrappers(blocks)
    expect(nodes).toHaveLength(2)
    expect(nodes[0].kind).toBe('wrapper')
    expect(nodes[1]).toMatchObject({ kind: 'block', block: { content: 'After the accordion.' } })
  })
})
