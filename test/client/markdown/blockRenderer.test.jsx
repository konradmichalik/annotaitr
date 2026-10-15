// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HtmlWrapper, BlockRenderer } from '../../../client/markdown/src/components/Viewer/BlockRenderer.jsx'

describe('HtmlWrapper', () => {
  it('renders a details wrapper around its children', () => {
    const block = { id: 'block-0', type: 'html', content: '<details>', htmlTag: 'details', htmlRole: 'open' }
    const html = renderToStaticMarkup(<HtmlWrapper block={block}><p>inner</p></HtmlWrapper>)
    expect(html).toMatch(/^<details[^>]*>/)
    expect(html).toContain('<p>inner</p>')
    expect(html).toContain('</details>')
    expect(html).toContain('data-block-id="block-0"')
  })

  it('carries allowlisted attributes over', () => {
    const block = { id: 'b', type: 'html', content: '<details open>', htmlTag: 'details', htmlRole: 'open' }
    expect(renderToStaticMarkup(<HtmlWrapper block={block} />)).toContain('open=""')
  })

  it('keeps the align attribute of a div wrapper', () => {
    const block = { id: 'b', type: 'html', content: '<div align="center">', htmlTag: 'div', htmlRole: 'open' }
    const html = renderToStaticMarkup(<HtmlWrapper block={block} />)
    expect(html).toMatch(/^<div /)
    expect(html).toContain('align="center"')
  })

  it('falls back to a div for an unknown tag', () => {
    const block = { id: 'b', type: 'html', content: '<script>', htmlTag: 'script', htmlRole: 'open' }
    expect(renderToStaticMarkup(<HtmlWrapper block={block} />)).toMatch(/^<div /)
  })
})

describe('BlockRenderer summary blocks', () => {
  it('renders a summary marker as a real summary element', () => {
    const block = { id: 'block-1', type: 'html', content: 'Click **me**', htmlTag: 'summary', htmlRole: 'summary' }
    const html = renderToStaticMarkup(<BlockRenderer block={block} />)
    expect(html).toMatch(/^<summary/)
    expect(html).toContain('data-block-id="block-1"')
    expect(html).toContain('<strong>me</strong>')
  })
})

describe('BlockRenderer quotes with nested blocks', () => {
  it('renders a nested blockquote around its children instead of inline text', () => {
    const block = { id: 'block-0', type: 'blockquote', content: '', nested: true }
    const html = renderToStaticMarkup(<BlockRenderer block={block}><pre>code</pre></BlockRenderer>)
    expect(html).toBe('<blockquote class="block-blockquote block-blockquote--nested" data-block-id="block-0"><pre>code</pre></blockquote>')
  })

  it('renders a nested alert with its title before the children', () => {
    const block = { id: 'block-1', type: 'alert', alertType: 'tip', content: '', nested: true }
    const html = renderToStaticMarkup(<BlockRenderer block={block}><ul><li>one</li></ul></BlockRenderer>)
    expect(html).toMatch(/^<div class="block-alert block-alert--tip block-alert--nested" data-block-id="block-1"><span class="block-alert-title">/)
    expect(html).toMatch(/Tip<\/span><ul><li>one<\/li><\/ul><\/div>$/)
  })

  it('renders a plain blockquote as inline markdown, as before', () => {
    const block = { id: 'block-2', type: 'blockquote', content: 'Plain **quote**' }
    const html = renderToStaticMarkup(<BlockRenderer block={block} />)
    expect(html).toMatch(/^<blockquote class="block-blockquote" data-block-id="block-2">/)
    expect(html).toContain('<strong>quote</strong>')
  })
})
