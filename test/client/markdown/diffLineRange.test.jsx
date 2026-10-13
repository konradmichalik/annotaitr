// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CodeBlock } from '../../../client/markdown/src/components/Viewer/CodeBlock.jsx'
import { diffLineRange } from '../../../client/markdown/src/utils/viewerDom.js'

const block = { id: 'block-1', type: 'code', language: 'diff src/A.php', content: '@@ -1,2 +1,2 @@\n a\n-b\n+c' }

function gutters() {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<CodeBlock block={block} />)
  return [...host.querySelectorAll('.diff-gutter')]
}

describe('diffLineRange', () => {
  it('covers the text of the line and not its gutter', () => {
    const [, context, removed, added] = gutters()
    expect(diffLineRange(context).toString()).toBe(' a')
    expect(diffLineRange(removed).toString()).toBe('-b')
    expect(diffLineRange(added).toString()).toBe('+c')
  })
  it('includes text that highlights split into pieces', () => {
    const host = document.createElement('div')
    host.innerHTML = '<span class="diff-line"><span class="diff-gutter"></span>+a<mark>b</mark>c<mark><mark>d</mark></mark></span>'
    expect(diffLineRange(host.querySelector('.diff-gutter')).toString()).toBe('+abcd')
  })
  it('is null for a line without text', () => {
    const host = document.createElement('div')
    host.innerHTML = '<span class="diff-line"><span class="diff-gutter"></span></span>'
    expect(diffLineRange(host.querySelector('.diff-gutter'))).toBeNull()
  })
})
