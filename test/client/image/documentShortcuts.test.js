// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { pageStepFor } from '../../../client/image/src/document/useDocumentShortcuts.js'

function keyOn(target, key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('pageStepFor', () => {
  const body = document.body

  it('maps the page keys', () => {
    expect(pageStepFor(keyOn(body, 'PageDown'))).toBe(1)
    expect(pageStepFor(keyOn(body, '['))).toBe(-1)
    expect(pageStepFor(keyOn(body, 'Home'))).toBe(-Infinity)
    expect(pageStepFor(keyOn(body, 'End'))).toBe(Infinity)
    expect(pageStepFor(keyOn(body, 'a'))).toBeNull()
  })

  it('ignores keys with a modifier, while typing and inside a menu', () => {
    expect(pageStepFor(keyOn(body, 'End', { metaKey: true }))).toBeNull()
    expect(pageStepFor(keyOn(document.createElement('textarea'), 'End'))).toBeNull()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    const item = document.createElement('button')
    menu.append(item)
    body.append(menu)
    expect(pageStepFor(keyOn(item, 'Home'))).toBeNull()
  })

  it('ignores a key something else already handled', () => {
    const event = keyOn(body, 'End')
    event.preventDefault()
    expect(pageStepFor(event)).toBeNull()
  })
})
