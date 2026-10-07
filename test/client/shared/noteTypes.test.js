import { describe, it, expect } from 'vitest'
import { noteType } from '../../../client/shared/utils/noteTypes.js'

describe('noteType', () => {
  it('names the markdown types as the intents they stand for', () => {
    expect(noteType({ type: 'DELETION' })).toEqual({ word: 'Remove', intent: 'remove' })
    expect(noteType({ type: 'INSERTION' })).toEqual({ word: 'Add', intent: 'add' })
    expect(noteType({ type: 'COMMENT' })).toEqual({ word: 'Comment', intent: 'change' })
  })

  it('calls a markdown comment about the whole file General', () => {
    expect(noteType({ type: 'COMMENT', targetType: 'global' })).toEqual({ word: 'General', intent: null })
  })

  it('names an image note by its shape, in sentence case', () => {
    expect(noteType({ type: 'box', geometry: {} }).word).toBe('Box')
    expect(noteType({ type: 'highlighter', geometry: {} }).word).toBe('Highlight')
    expect(noteType({ type: 'pin', geometry: {} }).word).toBe('Pin')
    expect(noteType({ type: 'element', geometry: {} }).word).toBe('Element')
  })

  it('tells an image comment on a page or a time from a general one', () => {
    expect(noteType({ type: 'comment', geometry: null })).toEqual({ word: 'General', intent: null })
    expect(noteType({ type: 'comment', geometry: null, page: 2 }).word).toBe('Comment')
    expect(noteType({ type: 'comment', geometry: null, time: 1 }).word).toBe('Comment')
  })

  it('falls back to the type itself in sentence case', () => {
    expect(noteType({ type: 'lasso' }).word).toBe('Lasso')
  })
})
