import { describe, it, expect } from 'vitest'
import {
  INTENTS, defaultIntent, intentOf, intentWord, intentForKey, nextNumber, normalizeNotes, isNumbered
} from '../../../client/shared/utils/intents.js'

describe('INTENTS', () => {
  it('lists the four intents with their words and keys', () => {
    expect(INTENTS.map((i) => `${i.key} ${i.word}`)).toEqual(['1 Change', '2 Add', '3 Remove', '4 Question'])
  })
})

describe('defaultIntent', () => {
  it('starts every mark, pins included, as a change', () => {
    expect(defaultIntent('pin')).toBe('change')
    expect(defaultIntent('box')).toBe('change')
    expect(defaultIntent('text')).toBe('change')
    expect(defaultIntent('COMMENT')).toBe('change')
  })

  it('maps markdown deletions and insertions to Remove and Add', () => {
    expect(defaultIntent('DELETION')).toBe('remove')
    expect(defaultIntent('INSERTION')).toBe('add')
  })

  it('starts new marks with the preferred intent, except fixed types', () => {
    expect(defaultIntent('box', 'remove')).toBe('remove')
    expect(defaultIntent('COMMENT', 'question')).toBe('question')
    expect(defaultIntent('pin', 'add')).toBe('add')
    expect(defaultIntent('DELETION', 'add')).toBe('remove')
    expect(defaultIntent('box', 'praise')).toBe('change')
  })
})

describe('intentOf', () => {
  it('keeps a known intent and falls back to the type default for old data', () => {
    expect(intentOf({ type: 'box', geometry: {}, intent: 'add' })).toBe('add')
    expect(intentOf({ type: 'pin', geometry: {} })).toBe('question')
    expect(intentOf({ type: 'box', geometry: {}, intent: 'nope' })).toBe('change')
  })

  it('has no intent for a general comment or an agent note', () => {
    expect(intentOf({ type: 'COMMENT', targetType: 'global' })).toBeNull()
    expect(intentOf({ type: 'comment', geometry: null })).toBeNull()
    expect(intentOf({ type: 'NOTES' })).toBeNull()
    expect(isNumbered({ type: 'comment', geometry: null, time: 2 })).toBe(true)
  })
})

describe('intentWord and intentForKey', () => {
  it('names an intent and calls a missing one General', () => {
    expect(intentWord('remove')).toBe('Remove')
    expect(intentWord(null)).toBe('General')
  })

  it('maps the keys 1 to 4 and nothing else', () => {
    expect(intentForKey('1')).toBe('change')
    expect(intentForKey('4')).toBe('question')
    expect(intentForKey('5')).toBeNull()
  })
})

describe('nextNumber', () => {
  it('counts on from the highest number in any group, so a deleted note leaves its gap', () => {
    expect(nextNumber([])).toBe(1)
    expect(nextNumber([{ number: 1 }, { number: 3 }])).toBe(4)
    expect(nextNumber([{ number: 1 }], [{ number: 5 }, null])).toBe(6)
  })
})

describe('normalizeNotes', () => {
  it('keeps stored numbers and gaps', () => {
    const notes = normalizeNotes([{ type: 'box', geometry: {}, number: 2 }, { type: 'pin', geometry: {}, number: 5 }])
    expect(notes.map((n) => [n.number, n.intent])).toEqual([[2, 'change'], [5, 'question']])
  })

  it('numbers old data in the given order without reordering the array', () => {
    const byTime = (list) => [...list].sort((a, b) => a.time - b.time)
    const notes = normalizeNotes(
      [{ id: 'late', type: 'box', geometry: {}, time: 5 }, { id: 'early', type: 'box', geometry: {}, time: 1 }],
      { order: byTime }
    )
    expect(notes.map((n) => [n.id, n.number])).toEqual([['late', 2], ['early', 1]])
  })

  it('skips numbers another file already uses', () => {
    const notes = normalizeNotes([{ type: 'COMMENT', number: 2 }, { type: 'DELETION' }], { reserved: [2, 3] })
    expect(notes.map((n) => n.number)).toEqual([4, 5])
  })

  it('leaves the general comment unnumbered and without intent', () => {
    const [general] = normalizeNotes([{ type: 'COMMENT', targetType: 'global', text: 'x', number: 1 }])
    expect(general).toEqual({ type: 'COMMENT', targetType: 'global', text: 'x', intent: null })
  })
})
