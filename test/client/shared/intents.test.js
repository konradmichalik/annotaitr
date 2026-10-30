import { describe, it, expect } from 'vitest'
import {
  INTENTS, defaultIntent, intentOf, intentWord, markIndex, markStyle, nextNumber, normalizeNotes, isNumbered
} from '../../../client/shared/utils/intents.js'

describe('INTENTS', () => {
  it('lists the two kinds of a note with their words', () => {
    expect(INTENTS.map((i) => `${i.id} ${i.word}`)).toEqual(['comment Comment', 'remove Remove'])
  })
})

describe('defaultIntent', () => {
  it('starts every mark, pins included, as a comment', () => {
    for (const type of ['pin', 'box', 'text', 'COMMENT', 'INSERTION']) { expect(defaultIntent(type)).toBe('comment') }
  })

  it('maps a markdown deletion to Remove', () => {
    expect(defaultIntent('DELETION')).toBe('remove')
  })
})

describe('intentOf', () => {
  it('keeps Remove and reads every other value, also the four intents of older data, as a comment', () => {
    expect(intentOf({ type: 'box', geometry: {}, intent: 'remove' })).toBe('remove')
    for (const intent of ['change', 'add', 'question', 'nope', undefined]) {
      expect(intentOf({ type: 'box', geometry: {}, intent })).toBe('comment')
    }
    expect(intentOf({ type: 'pin', geometry: {} })).toBe('comment')
  })

  it('reads a deletion as Remove and an insertion as a comment, whatever the field says', () => {
    expect(intentOf({ type: 'DELETION', intent: 'comment' })).toBe('remove')
    expect(intentOf({ type: 'INSERTION', intent: 'remove' })).toBe('comment')
  })

  it('has no intent for a general comment or an agent note', () => {
    expect(intentOf({ type: 'COMMENT', targetType: 'global' })).toBeNull()
    expect(intentOf({ type: 'comment', geometry: null })).toBeNull()
    expect(intentOf({ type: 'NOTES' })).toBeNull()
    expect(isNumbered({ type: 'comment', geometry: null, time: 2 })).toBe(true)
  })
})

describe('intentWord', () => {
  it('names a kind and calls a missing one General', () => {
    expect(intentWord('comment')).toBe('Comment')
    expect(intentWord('remove')).toBe('Remove')
    expect(intentWord(null)).toBe('General')
  })
})

describe('markIndex and markStyle', () => {
  it('rotates through four colours by note number', () => {
    expect([1, 2, 3, 4, 5, 6, 8, 9].map(markIndex)).toEqual([1, 2, 3, 4, 1, 2, 4, 1])
  })

  it('falls back to the first colour without a usable number', () => {
    for (const number of [undefined, null, 0, -1, 2.5, '3']) { expect(markIndex(number)).toBe(1) }
  })

  it('pairs the colour with the colour of its number', () => {
    expect(markStyle(2)).toEqual({ background: 'var(--mark-2)', color: 'var(--mark-2-on)' })
    expect(markStyle(5)).toEqual({ background: 'var(--mark-1)', color: 'var(--mark-1-on)' })
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
    expect(notes.map((n) => [n.number, n.intent])).toEqual([[2, 'comment'], [5, 'comment']])
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
