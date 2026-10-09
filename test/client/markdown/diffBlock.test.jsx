// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CodeBlock } from '../../../client/markdown/src/components/Viewer/CodeBlock.jsx'

const content = '@@ -41,2 +41,2 @@\n a\n-b\n+c'

function render(language) {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<CodeBlock block={{ id: 'block-3', type: 'code', language, content }} />)
  return host
}

describe('CodeBlock with a diff', () => {
  it('keeps the text of the code exactly the fenced source, so quotes match it', () => {
    expect(render('diff').querySelector('code').textContent).toBe(content)
  })

  it('puts old and new line numbers on the gutter, not into the text', () => {
    const gutters = [...render('diff').querySelectorAll('.diff-gutter')]
    expect(gutters.map((g) => [g.dataset.old, g.dataset.new])).toEqual([['', ''], ['41', '41'], ['42', ''], ['', '42']])
  })

  it('shows the path from the fence info and the line counts in a header', () => {
    const header = render('diff src/Foo.php').querySelector('.diff-header')
    expect(header.querySelector('.diff-path').textContent).toBe('src/Foo.php')
    expect(header.querySelector('.diff-counts').textContent).toBe('+1 −1')
  })

  it('keeps the block id on the wrapper for annotations', () => {
    expect(render('diff').querySelector('[data-block-id="block-3"]')).not.toBeNull()
  })

  it('leaves other languages to highlight.js', () => {
    const host = render('js')
    expect(host.querySelector('.diff-line')).toBeNull()
    expect(host.querySelector('code').className).toBe('hljs language-js')
  })
})
