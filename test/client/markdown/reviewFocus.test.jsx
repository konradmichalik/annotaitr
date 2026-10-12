// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ReviewFocus } from '../../../client/markdown/src/components/Viewer/ChangesBlocks.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const file = (path, attention = null, focusWhy = null) => ({ path, attention, focusWhy })
const files = [
  file('src/Cache.php', 'high', 'The `key` decides which data a user sees.'),
  file('src/Other.php')
]

let host
let root
let onSelect

beforeEach(() => {
  onSelect = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<ReviewFocus files={files} onSelect={onSelect} />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('ReviewFocus', () => {
  it('names how many files to check closely and that the others stay visible', () => {
    expect(host.querySelector('h2').textContent).toBe('Review focus: 1 of 2 files to check closely')
    expect(host.textContent).toContain('The other 1 stay visible and reviewable like any file.')
  })

  it('renders the reason as inline markdown, like the card does', () => {
    const why = host.querySelector('.change-focus-why')
    expect(why.querySelector('code').textContent).toBe('key')
    expect(why.textContent).toBe('The key decides which data a user sees.')
  })

  it('jumps to the file from its row', () => {
    host.querySelector('button').click()
    expect(onSelect).toHaveBeenCalledWith('src/Cache.php')
  })

  it('renders nothing without a file to check closely', () => {
    act(() => root.render(<ReviewFocus files={[file('a.js')]} onSelect={onSelect} />))
    expect(host.innerHTML).toBe('')
  })
})
