// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useStrayDropGuard } from '../../../client/markdown/src/hooks/useStrayDropGuard.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function Page() {
  useStrayDropGuard()
  return (
    <div>
      <p className="outside">Text</p>
      <div className="zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.target.dataset.dropped = 'yes' }} />
    </div>
  )
}

let host
let root

const drag = (target, type, types) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  event.dataTransfer = { types, dropEffect: 'copy' }
  target.dispatchEvent(event)
  return event
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<Page />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('a file dropped outside the comment box', () => {
  it('is refused, so the browser does not open it in place of the review', () => {
    const outside = host.querySelector('.outside')
    const over = drag(outside, 'dragover', ['Files'])
    expect(over.defaultPrevented).toBe(true)
    expect(over.dataTransfer.dropEffect).toBe('none')
    expect(drag(outside, 'drop', ['Files']).defaultPrevented).toBe(true)
  })

  it('still lands where a drop zone takes it', () => {
    const zone = host.querySelector('.zone')
    const over = drag(zone, 'dragover', ['Files'])
    expect(over.dataTransfer.dropEffect).toBe('copy')
    drag(zone, 'drop', ['Files'])
    expect(zone.dataset.dropped).toBe('yes')
  })

  it('leaves dragging text alone', () => {
    const outside = host.querySelector('.outside')
    expect(drag(outside, 'dragover', ['text/plain']).defaultPrevented).toBe(false)
    expect(drag(outside, 'drop', ['text/plain']).defaultPrevented).toBe(false)
  })

  it('stops refusing once the page is gone', () => {
    act(() => root.unmount())
    expect(drag(document.body, 'drop', ['Files']).defaultPrevented).toBe(false)
    root = createRoot(host)
  })
})
