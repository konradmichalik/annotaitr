// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import ImageStrip from '../../../client/image/src/components/ImageStrip.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const images = [
  { label: 'a.png', width: 200, height: 100 },
  { label: 'b.png', width: 100, height: 100 }
]

let host
let root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (props) => act(() => root.render(<ImageStrip images={images} current={0} counts={{}} onSelect={() => {}} {...props} />))

describe('ImageStrip', () => {
  it('marks the current image and names each with its label and note count', () => {
    render({ counts: { 1: 2 } })
    const [first, second] = host.querySelectorAll('button')
    expect(first.getAttribute('aria-current')).toBe('true')
    expect(second.getAttribute('aria-current')).toBeNull()
    expect(second.getAttribute('aria-label')).toBe('Image 2: b.png, 2 annotations')
  })

  it('loads each thumbnail by its index', () => {
    render()
    expect([...host.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual(['/api/image?index=0', '/api/image?index=1'])
  })

  it('selects an image by its index', () => {
    const onSelect = vi.fn()
    render({ onSelect })
    act(() => host.querySelectorAll('button')[1].click())
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
