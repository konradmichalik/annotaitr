// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useInsertionClick } from '../../../client/markdown/src/hooks/useInsertionClick.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host
let root
let latestState

function Harness() {
  const containerRef = useRef(null)
  const [toolbarState, setToolbarState] = useState(null)
  latestState = toolbarState
  useInsertionClick({
    containerRef,
    toolbarState,
    setToolbarState,
    setRequestedToolbarStep: () => {},
    pendingSourceRef: { current: null },
    isRestoringRef: { current: false },
    annotationsRef: { current: [] },
    onSelectAnnotation: () => {},
  })
  return (
    <div ref={containerRef}>
      <p data-block-id="b1">A paragraph to review.</p>
    </div>
  )
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0 })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<Harness />))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('useInsertionClick', () => {
  it('keeps the insertion marker in the document once the toolbar opens on it', () => {
    const block = host.querySelector('[data-block-id="b1"]')
    const range = document.createRange()
    range.setStart(block.firstChild, 11)
    range.collapse(true)
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(range)

    act(() => {
      block.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }))
    })

    expect(latestState?.insertionMode).toBe(true)
    expect(latestState.insertionData).toMatchObject({ blockId: 'b1', offset: 11 })
    // The toolbar is positioned from this marker: a detached one measures 0,0.
    expect(latestState.element.isConnected).toBe(true)
  })
})
