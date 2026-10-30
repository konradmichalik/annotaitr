import { describe, it, expect } from 'vitest'
import { noteType } from '../../../client/shared/utils/noteTypes.js'

describe('noteType', () => {
  it('names a markdown note by its kind and the kind of selection', () => {
    expect(noteType({ type: 'DELETION' })).toEqual({ word: 'Remove', intent: 'remove', shape: 'Text' })
    expect(noteType({ type: 'INSERTION' })).toEqual({ word: 'Comment', intent: 'comment', shape: 'Insertion' })
    expect(noteType({ type: 'COMMENT', intent: 'question', targetType: 'diagram' })).toEqual({ word: 'Comment', intent: 'comment', shape: 'Diagram' })
  })

  it('calls a markdown comment about the whole file General', () => {
    expect(noteType({ type: 'COMMENT', targetType: 'global' })).toEqual({ word: 'General', intent: null, shape: null })
  })

  it('names an image note by its kind and keeps the shape for the location', () => {
    expect(noteType({ type: 'box', geometry: {} })).toEqual({ word: 'Comment', intent: 'comment', shape: 'Box' })
    expect(noteType({ type: 'pin', geometry: {} })).toEqual({ word: 'Comment', intent: 'comment', shape: 'Pin' })
    expect(noteType({ type: 'highlighter', geometry: {}, intent: 'remove' })).toEqual({ word: 'Remove', intent: 'remove', shape: 'Highlight' })
  })

  it('tells an image comment on a page or a time from a general one', () => {
    expect(noteType({ type: 'comment', geometry: null }).word).toBe('General')
    expect(noteType({ type: 'comment', geometry: null, page: 2 })).toEqual({ word: 'Comment', intent: 'comment', shape: 'Comment' })
    expect(noteType({ type: 'comment', geometry: null, time: 1 }).shape).toBe('Comment')
  })

  it('falls back to the type itself in sentence case', () => {
    expect(noteType({ type: 'lasso' }).shape).toBe('Lasso')
  })
})
