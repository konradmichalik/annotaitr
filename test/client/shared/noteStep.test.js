import { describe, it, expect } from 'vitest'
import { stepNote, notePosition } from '../../../client/shared/utils/noteStep.js'

const ids = ['a', 'b', 'c']

describe('stepNote', () => {
  it('moves to the next and the previous note', () => {
    expect(stepNote(ids, 'a', 1)).toBe('b')
    expect(stepNote(ids, 'c', -1)).toBe('b')
  })

  it('stops at the ends instead of wrapping', () => {
    expect(stepNote(ids, 'c', 1)).toBe('c')
    expect(stepNote(ids, 'a', -1)).toBe('a')
  })

  it('starts at the first note going forward and at the last going back when none is selected', () => {
    expect(stepNote(ids, null, 1)).toBe('a')
    expect(stepNote(ids, null, -1)).toBe('c')
    expect(stepNote(ids, 'gone', 1)).toBe('a')
  })

  it('has nowhere to go without notes', () => {
    expect(stepNote([], null, 1)).toBeNull()
  })
})

describe('notePosition', () => {
  it('is the one-based place of the selected note, 0 when none is selected', () => {
    expect(notePosition(ids, 'b')).toBe(2)
    expect(notePosition(ids, null)).toBe(0)
    expect(notePosition(ids, 'gone')).toBe(0)
  })
})
