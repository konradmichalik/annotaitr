// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { TableOfContents } from '../../../client/markdown/src/components/TableOfContents.jsx'
import { parseMarkdownToBlocks } from '../../../client/markdown/src/utils/parser.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const blocks = parseMarkdownToBlocks('# Plan\n\nIntro.\n\n## Steps\n\nOne.\n')
let observed
let host
let root
let viewer

class FakeObserver {
  observe(element) { observed.push(element) }
  disconnect() {}
}

function mountViewer() {
  viewer?.remove()
  viewer = document.createElement('div')
  viewer.className = 'viewer-container'
  viewer.innerHTML = blocks.map((b) => `<p data-block-id="${b.id}">${b.content}</p>`).join('')
  document.body.appendChild(viewer)
}

beforeEach(() => {
  observed = []
  globalThis.IntersectionObserver = FakeObserver
  Element.prototype.scrollIntoView = () => {}
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  viewer.remove()
  viewer = null
})

describe('TableOfContents scroll spy', () => {
  it('observes the headings of a viewer mounted again after the view changed', () => {
    mountViewer()
    act(() => root.render(<TableOfContents blocks={blocks} collapsed={false} width={220} viewKey="preview" />))
    expect(observed.every((el) => el.isConnected)).toBe(true)
    const first = observed.length
    expect(first).toBeGreaterThan(0)

    mountViewer()
    observed = []
    act(() => root.render(<TableOfContents blocks={blocks} collapsed={false} width={220} viewKey="changes" />))
    expect(observed).toHaveLength(first)
    expect(observed.every((el) => el.isConnected && viewer.contains(el))).toBe(true)
  })
})
