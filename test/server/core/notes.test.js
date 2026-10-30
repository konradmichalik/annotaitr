import { describe, it, expect } from 'vitest'
import { intentOf, intentWord, kindPrefix, normalizeNotes, intentCounts, isNumbered } from '../../../server/core/notes.js'

describe('intentOf', () => {
  it('knows two kinds: a comment and a removal', () => {
    expect(intentOf({ type: 'box', geometry: {} })).toBe('comment')
    expect(intentOf({ type: 'box', geometry: {}, intent: 'remove' })).toBe('remove')
    expect(intentOf({ type: 'pin', geometry: {} })).toBe('comment')
    expect(intentOf({ type: 'COMMENT' })).toBe('comment')
  })

  it('reads the four intents of older data as a comment, Remove stays', () => {
    for (const intent of ['change', 'add', 'question', 'shout']) {
      expect(intentOf({ type: 'arrow', geometry: {}, intent })).toBe('comment')
    }
    expect(intentOf({ type: 'pin', geometry: {} })).toBe('comment')
  })

  it('reads a markdown deletion as Remove and an insertion as a comment, whatever the field says', () => {
    expect(intentOf({ type: 'DELETION', intent: 'comment' })).toBe('remove')
    expect(intentOf({ type: 'INSERTION', intent: 'remove' })).toBe('comment')
  })

  it('gives a comment on a page or a time the kind of its field', () => {
    expect(intentOf({ type: 'comment', geometry: null, page: 2 })).toBe('comment')
    expect(intentOf({ type: 'comment', geometry: null, time: 1.5, intent: 'remove' })).toBe('remove')
  })

  it('gives a general comment and an agent note no intent', () => {
    expect(intentOf({ type: 'COMMENT', targetType: 'global', intent: 'remove' })).toBeNull()
    expect(intentOf({ type: 'comment', geometry: null })).toBeNull()
    expect(intentOf({ type: 'NOTES' })).toBeNull()
  })
})

describe('intentWord', () => {
  it('names the kind in sentence case', () => {
    expect(intentWord('comment')).toBe('Comment')
    expect(intentWord('remove')).toBe('Remove')
    expect(intentWord(null)).toBe('General')
  })
})

describe('kindPrefix', () => {
  it('marks a removal and leaves a comment bare', () => {
    expect(kindPrefix({ type: 'box', geometry: {}, intent: 'remove' })).toBe('Remove · ')
    expect(kindPrefix({ type: 'DELETION' })).toBe('Remove · ')
    expect(kindPrefix({ type: 'box', geometry: {} })).toBe('')
    expect(kindPrefix({ type: 'box', geometry: {}, intent: 'question' })).toBe('')
  })

  it('leaves a general comment bare', () => {
    expect(kindPrefix({ type: 'comment', geometry: null, intent: 'remove' })).toBe('')
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
    expect(notes[1]).toMatchObject({ intent: 'comment', number: 1 })
  })

  it('does not mutate its input', () => {
    const input = [{ type: 'box', geometry: {} }]
    normalizeNotes(input)
    expect(input[0]).toEqual({ type: 'box', geometry: {} })
  })
})

describe('intentCounts', () => {
  it('counts notes per kind in a fixed order, general comments last', () => {
    const notes = [
      { type: 'pin', geometry: {} },
      { type: 'box', geometry: {} },
      { type: 'DELETION' },
      { type: 'box', geometry: {}, intent: 'add' },
      { type: 'comment', geometry: null },
      { type: 'box', geometry: {} }
    ]
    expect(intentCounts(notes)).toBe('4 Comment, 1 Remove, 1 General')
  })

  it('is empty without notes', () => {
    expect(intentCounts([])).toBe('')
  })
})
