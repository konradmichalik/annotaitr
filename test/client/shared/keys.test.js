// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { isTypingTarget, isPlainKeyPress, isSaveKey } from '../../../client/shared/utils/keys.js'

function keyOn(target, key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

function element(tag, attributes = {}) {
  const node = document.createElement(tag)
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value))
  document.body.append(node)
  return node
}

describe('isTypingTarget', () => {
  it('is true for text fields, selects and editable content', () => {
    expect(isTypingTarget(element('textarea'))).toBe(true)
    expect(isTypingTarget(element('input'))).toBe(true)
    expect(isTypingTarget(element('input', { type: 'search' }))).toBe(true)
    expect(isTypingTarget(element('select'))).toBe(true)
    const editable = element('div', { contenteditable: 'true' })
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isTypingTarget(editable)).toBe(true)
  })

  it('is false for buttons, checkboxes, radios and the page', () => {
    expect(isTypingTarget(element('button'))).toBe(false)
    expect(isTypingTarget(element('input', { type: 'checkbox' }))).toBe(false)
    expect(isTypingTarget(element('input', { type: 'radio' }))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('isPlainKeyPress', () => {
  it('accepts a bare key on the page or a button', () => {
    expect(isPlainKeyPress(keyOn(document.body, 'r'))).toBe(true)
    expect(isPlainKeyPress(keyOn(element('button'), 'r'))).toBe(true)
  })

  it('rejects a key with any modifier held', () => {
    for (const modifier of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey']) {
      expect(isPlainKeyPress(keyOn(document.body, 'r', { [modifier]: true }))).toBe(false)
    }
  })

  it('rejects a key while typing', () => {
    expect(isPlainKeyPress(keyOn(element('textarea'), 'r'))).toBe(false)
    expect(isPlainKeyPress(keyOn(element('input'), 'r'))).toBe(false)
  })

  it('rejects a key inside a menu or a dialog', () => {
    const menu = element('div', { role: 'menu' })
    const item = document.createElement('button')
    menu.append(item)
    expect(isPlainKeyPress(keyOn(item, 'r'))).toBe(false)
    const dialog = element('div', { role: 'dialog' })
    const close = document.createElement('button')
    dialog.append(close)
    expect(isPlainKeyPress(keyOn(close, 'r'))).toBe(false)
  })

  it('rejects a key something else already handled', () => {
    const event = keyOn(document.body, 'r')
    event.preventDefault()
    expect(isPlainKeyPress(event)).toBe(false)
  })
})

describe('isSaveKey', () => {
  it('accepts Cmd or Ctrl with Enter', () => {
    expect(isSaveKey(keyOn(document.body, 'Enter', { metaKey: true }))).toBe(true)
    expect(isSaveKey(keyOn(document.body, 'Enter', { ctrlKey: true }))).toBe(true)
  })

  it('leaves Cmd+Shift+Enter to the decision shortcut', () => {
    expect(isSaveKey(keyOn(document.body, 'Enter', { metaKey: true, shiftKey: true }))).toBe(false)
    expect(isSaveKey(keyOn(document.body, 'Enter', { ctrlKey: true, shiftKey: true }))).toBe(false)
  })

  it('rejects a plain Enter, another key and a key during composition', () => {
    expect(isSaveKey(keyOn(document.body, 'Enter'))).toBe(false)
    expect(isSaveKey(keyOn(document.body, 's', { metaKey: true }))).toBe(false)
    expect(isSaveKey(keyOn(document.body, 'Enter', { metaKey: true, isComposing: true }))).toBe(false)
  })

  it('reads composition from a React event as well', () => {
    const reactEvent = { key: 'Enter', metaKey: true, nativeEvent: { isComposing: true } }
    expect(isSaveKey(reactEvent)).toBe(false)
    expect(isSaveKey({ ...reactEvent, nativeEvent: { isComposing: false } })).toBe(true)
  })
})
