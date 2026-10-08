// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { TOOL_KEYS, toolForKey } from '../../../client/image/src/utils/toolShortcuts.js'

function keyOn(target, key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

const ALL = ['select', 'element', 'text', 'box', 'arrow', 'freehand', 'highlighter', 'pin']

describe('toolForKey', () => {
  it('maps each letter to its tool', () => {
    const expected = { v: 'select', e: 'element', t: 'text', r: 'box', a: 'arrow', p: 'freehand', h: 'highlighter', c: 'pin' }
    for (const [key, tool] of Object.entries(expected)) {
      expect(toolForKey(keyOn(document.body, key), ALL)).toBe(tool)
    }
  })

  it('reads the key case-insensitively, so Caps Lock keeps working', () => {
    expect(toolForKey(keyOn(document.body, 'R'), ALL)).toBe('box')
  })

  it('goes back to Select on Escape', () => {
    expect(toolForKey(keyOn(document.body, 'Escape'), ALL)).toBe('select')
  })

  it('ignores a tool the mode does not offer', () => {
    expect(toolForKey(keyOn(document.body, 'e'), ['select', 'box'])).toBeNull()
    expect(toolForKey(keyOn(document.body, 't'), ['select', 'box'])).toBeNull()
  })

  it('leaves the video and page keys alone', () => {
    for (const key of [' ', 'i', 'o', 'm', 'ArrowLeft', '[', ']', 'Home', 'End', 'PageUp']) {
      expect(toolForKey(keyOn(document.body, key), ALL)).toBeNull()
    }
  })

  it('ignores keys while typing and with a modifier held', () => {
    expect(toolForKey(keyOn(document.createElement('textarea'), 'r'), ALL)).toBeNull()
    expect(toolForKey(keyOn(document.body, 'r', { metaKey: true }), ALL)).toBeNull()
    expect(toolForKey(keyOn(document.body, 'r', { shiftKey: true }), ALL)).toBeNull()
    expect(toolForKey(keyOn(document.createElement('textarea'), 'Escape'), ALL)).toBeNull()
  })

  it('names one key per tool', () => {
    expect(Object.keys(TOOL_KEYS).sort()).toEqual([...ALL].sort())
    expect(new Set(Object.values(TOOL_KEYS)).size).toBe(ALL.length)
  })
})
