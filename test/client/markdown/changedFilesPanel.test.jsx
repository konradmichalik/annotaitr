// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ChangedFilesPanel } from '../../../client/markdown/src/components/ChangedFilesPanel.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const entry = (path, status, added, removed) => ({ path, status, added, removed, explained: true, heading: { id: path }, blocks: [] })
const sections = {
  overview: [],
  files: [entry('src/Controller/PageController.php', 'M', 75, 2), entry('src/Domain/Facet.php', 'A', 10, 0)]
}

let host
let root

const button = (name) => [...host.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent).startsWith(name))

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(
    <ChangedFilesPanel
      sections={sections}
      counts={{ overview: 0, byPath: new Map() }}
      reviewed={new Set()}
      current={null}
      onSelect={() => {}}
      onToggleReviewed={() => {}}
    />
  ))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('ChangedFilesPanel', () => {
  it('shows the line counts of a file and names its status in a tooltip', () => {
    const file = button('src/Controller/PageController.php')
    expect(file.querySelector('.changed-tree-counts').textContent).toBe('+75 −2')
    expect(file.querySelector('.changed-tree-status').getAttribute('title')).toBe('Modified')
    expect(file.getAttribute('aria-label')).toContain('+75 −2, modified')
  })

  it('collapses and expands a folder', () => {
    const folder = button('src')
    expect(folder.getAttribute('aria-expanded')).toBe('true')
    act(() => folder.click())
    expect(folder.getAttribute('aria-expanded')).toBe('false')
    expect(button('src/Controller/PageController.php')).toBeUndefined()
    act(() => folder.click())
    expect(button('src/Controller/PageController.php')).toBeDefined()
  })

  it('offers line breaks only between the parts of a name', () => {
    expect(button('src/Controller/PageController.php').querySelectorAll('wbr')).toHaveLength(2)
  })
})
