// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import ColorModePicker from '../../../client/image/src/components/ColorModePicker.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host
let root

const press = (key) => act(() => {
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
})
const options = () => [...host.querySelectorAll('[role="menuitemradio"], [role="radio"]')]
const trigger = () => host.querySelector('.color-mode-trigger')

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<ColorModePicker colorMode="intent" fixedColor="#ff0000" onChangeMode={() => {}} onChangeColor={() => {}} />))
  act(() => trigger().click())
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('ColorModePicker keyboard', () => {
  it('focuses the current option when the menu opens', () => {
    expect(document.activeElement).toBe(options()[0])
  })

  it('moves through the options with the arrow keys, wrapping, and with Home and End', () => {
    press('ArrowDown')
    expect(document.activeElement).toBe(options()[1])
    press('End')
    expect(document.activeElement).toBe(options().at(-1))
    press('ArrowDown')
    expect(document.activeElement).toBe(options()[0])
    press('ArrowUp')
    expect(document.activeElement).toBe(options().at(-1))
    press('Home')
    expect(document.activeElement).toBe(options()[0])
  })

  it('closes on Escape and returns focus to the trigger', () => {
    press('Escape')
    expect(host.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })
})
