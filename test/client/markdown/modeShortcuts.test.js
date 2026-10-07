// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { modeForKey } from '../../../client/markdown/src/hooks/useModeShortcuts.js'

function keyOn(target, key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('modeForKey', () => {
  it('maps V to Select text and C to Pinpoint', () => {
    expect(modeForKey(keyOn(document.body, 'v'))).toBe('select')
    expect(modeForKey(keyOn(document.body, 'C'))).toBe('pinpoint')
    expect(modeForKey(keyOn(document.body, 'r'))).toBeNull()
  })

  it('ignores keys while typing and with a modifier held', () => {
    expect(modeForKey(keyOn(document.createElement('textarea'), 'v'))).toBeNull()
    expect(modeForKey(keyOn(document.body, 'c', { metaKey: true }))).toBeNull()
    expect(modeForKey(keyOn(document.body, 'c', { shiftKey: true }))).toBeNull()
  })
})
