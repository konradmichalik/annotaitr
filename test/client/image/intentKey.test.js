// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { intentChangeForKey } from '../../../client/image/src/utils/toolShortcuts.js'

function keyOn(target, key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

const box = { id: 'a', type: 'rect', intent: 'change', geometry: { x: 0, y: 0, width: 1, height: 1 } }

describe('intentChangeForKey', () => {
  it('maps 1 to 4 to the four intents of a selected mark', () => {
    expect(intentChangeForKey(keyOn(document.body, '2'), box)).toBe('add')
    expect(intentChangeForKey(keyOn(document.body, '3'), box)).toBe('remove')
    expect(intentChangeForKey(keyOn(document.body, '4'), box)).toBe('question')
  })

  it('ignores the intent the mark already has, other keys and no selection', () => {
    expect(intentChangeForKey(keyOn(document.body, '1'), box)).toBeNull()
    expect(intentChangeForKey(keyOn(document.body, '5'), box)).toBeNull()
    expect(intentChangeForKey(keyOn(document.body, '2'), null)).toBeNull()
  })

  it('leaves digits typed into a field or the composer alone', () => {
    const field = document.createElement('textarea')
    expect(intentChangeForKey(keyOn(field, '2'), box)).toBeNull()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const chip = document.createElement('button')
    dialog.appendChild(chip)
    expect(intentChangeForKey(keyOn(chip, '2'), box)).toBeNull()
  })

  it('ignores a key with a modifier', () => {
    expect(intentChangeForKey(keyOn(document.body, '2', { altKey: true }), box)).toBeNull()
  })

  it('leaves a general comment without an intent', () => {
    expect(intentChangeForKey(keyOn(document.body, '2'), { id: 'g', type: 'comment', text: 'x' })).toBeNull()
  })
})
