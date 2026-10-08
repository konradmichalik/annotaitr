import { describe, it, expect } from 'vitest'
import { intentOf, intentWord, normalizeNotes, intentCounts, isNumbered } from '../../../server/core/notes.js'

describe('intentOf', () => {
  it('keeps a known intent', () => {
    expect(intentOf({ type: 'box', intent: 'question' })).toBe('question')
    expect(intentOf({ type: 'COMMENT', intent: 'add' })).toBe('add')
  })

  it('derives the default from the type when the intent is missing or unknown', () => {
    expect(intentOf({ type: 'box', geometry: {} })).toBe('change')
    expect(intentOf({ type: 'text', geometry: {} })).toBe('change')
    expect(intentOf({ type: 'pin', geometry: {} })).toBe('question')
    expect(intentOf({ type: 'arrow', geometry: {}, intent: 'shout' })).toBe('change')
    expect(intentOf({ type: 'COMMENT' })).toBe('change')
  })

  it('reads a markdown deletion and insertion as Remove and Add, whatever the field says', () => {
    expect(intentOf({ type: 'DELETION' })).toBe('remove')
    expect(intentOf({ type: 'INSERTION', intent: 'question' })).toBe('add')
  })

  it('gives a comment on a page or a time the default for notes without a shape', () => {
    expect(intentOf({ type: 'comment', geometry: null, page: 2 })).toBe('change')
    expect(intentOf({ type: 'comment', geometry: null, time: 1.5, intent: 'question' })).toBe('question')
  })

  it('gives a general comment and an agent note no intent', () => {
    expect(intentOf({ type: 'COMMENT', targetType: 'global', intent: 'change' })).toBeNull()
    expect(intentOf({ type: 'comment', geometry: null })).toBeNull()
    expect(intentOf({ type: 'NOTES' })).toBeNull()
  })
})

describe('intentWord', () => {
  it('names the intent in sentence case', () => {
    expect(intentWord('change')).toBe('Change')
    expect(intentWord('question')).toBe('Question')
  })
})

describe('isNumbered', () => {
  it('numbers every note except general comments and agent notes', () => {
    expect(isNumbered({ type: 'box', geometry: {} })).toBe(true)
    expect(isNumbered({ type: 'comment', geometry: null, page: 1 })).toBe(true)
    expect(isNumbered({ type: 'comment', geometry: null })).toBe(false)
    expect(isNumbered({ type: 'COMMENT', targetType: 'global' })).toBe(false)
    expect(isNumbered({ type: 'NOTES' })).toBe(false)
  })
})

describe('normalizeNotes', () => {
  it('keeps the numbers the notes carry, gaps included', () => {
    const notes = normalizeNotes([
      { id: 'a', type: 'box', geometry: {}, number: 1 },
      { id: 'b', type: 'pin', geometry: {}, number: 4 }
    ])
    expect(notes.map((n) => n.number)).toEqual([1, 4])
  })

  it('numbers notes without one after the highest number, in the order given', () => {
    const notes = normalizeNotes([
      { id: 'a', type: 'box', geometry: {} },
      { id: 'b', type: 'box', geometry: {}, number: 3 },
      { id: 'c', type: 'pin', geometry: {} }
    ])
    expect(notes.map((n) => n.number)).toEqual([4, 3, 5])
  })

  it('numbers old data without any numbers from 1 in the order given', () => {
    const notes = normalizeNotes([{ type: 'DELETION' }, { type: 'COMMENT' }])
    expect(notes.map((n) => n.number)).toEqual([1, 2])
  })

  it('renumbers a duplicate or invalid number instead of printing it twice', () => {
    const notes = normalizeNotes([
      { type: 'box', geometry: {}, number: 2 },
      { type: 'box', geometry: {}, number: 2 },
      { type: 'box', geometry: {}, number: 0 },
      { type: 'box', geometry: {}, number: '7' }
    ])
    expect(notes.map((n) => n.number)).toEqual([2, 3, 4, 5])
  })

  it('fills in the intent and leaves general comments without number or intent', () => {
    const notes = normalizeNotes([
      { type: 'comment', geometry: null, text: 'overall', number: 9 },
      { type: 'pin', geometry: {} }
    ])
    expect(notes[0]).toEqual({ type: 'comment', geometry: null, text: 'overall', intent: null })
    expect(notes[1]).toMatchObject({ intent: 'question', number: 1 })
  })

  it('does not mutate its input', () => {
    const input = [{ type: 'box', geometry: {} }]
    normalizeNotes(input)
    expect(input[0]).toEqual({ type: 'box', geometry: {} })
  })
})

describe('intentCounts', () => {
  it('counts notes per intent in a fixed order, general comments last', () => {
    const notes = [
      { type: 'pin', geometry: {} },
      { type: 'box', geometry: {} },
      { type: 'DELETION' },
      { type: 'box', geometry: {}, intent: 'add' },
      { type: 'comment', geometry: null },
      { type: 'box', geometry: {} }
    ]
    expect(intentCounts(notes)).toBe('2 Change, 1 Add, 1 Remove, 1 Question, 1 General')
  })

  it('is empty without notes', () => {
    expect(intentCounts([])).toBe('')
  })
})
