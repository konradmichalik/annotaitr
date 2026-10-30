// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createPersistentInsertionMarker } from '../../../client/markdown/src/utils/viewerDom.js'

// A code block as CodeBlock renders it: toolbar and diff header come before the code in the DOM.
function codeBlock() {
  const host = document.createElement('div')
  host.innerHTML = '<div data-block-id="block-1"><div class="diff-header">src/x.js +1 −1</div>' +
    '<div class="code-toolbar"><button>copy</button></div><pre><code><span class="line">-a</span>\n<span class="line" id="added">+b</span></code></pre></div>'
  document.body.appendChild(host)
  return host
}

describe('insertion markers in a code block', () => {
  it('place a restored marker at the same offset inside the code', () => {
    const host = codeBlock()
    const marker = createPersistentInsertionMarker('ann-1', host.querySelector('[data-block-id]'), 2, 1)
    expect(host.querySelector('code').contains(marker)).toBe(true)
    expect(marker.previousSibling?.textContent ?? marker.parentElement.previousSibling?.textContent).toContain('-a')
    host.remove()
  })
})
