import { describe, it, expect } from 'vitest'
import { noteType } from '../../../client/shared/utils/noteTypes.js'

describe('noteType', () => {
  it('names a markdown note by its intent and the kind of selection', () => {
    expect(noteType({ type: 'DELETION' })).toEqual({ word: 'Remove', intent: 'remove', shape: 'Text' })
    expect(noteType({ type: 'INSERTION' })).toEqual({ word: 'Add', intent: 'add', shape: 'Insertion' })
    expect(noteType({ type: 'COMMENT', intent: 'question', targetType: 'diagram' })).toEqual({ word: 'Question', intent: 'question', shape: 'Diagram' })
  })

  it('calls a markdown comment about the whole file General', () => {
    expect(noteType({ type: 'COMMENT', targetType: 'global' })).toEqual({ word: 'General', intent: null, shape: null })
  })

  it('names an image note by its intent and keeps the shape for the location', () => {
    expect(noteType({ type: 'box', geometry: {} })).toEqual({ word: 'Change', intent: 'change', shape: 'Box' })
    expect(noteType({ type: 'pin', geometry: {} })).toEqual({ word: 'Question', intent: 'question', shape: 'Pin' })
    expect(noteType({ type: 'highlighter', geometry: {}, intent: 'remove' }).shape).toBe('Highlight')
  })

  it('tells an image comment on a page or a time from a general one', () => {
    expect(noteType({ type: 'comment', geometry: null }).word).toBe('General')
    expect(noteType({ type: 'comment', geometry: null, page: 2 })).toEqual({ word: 'Change', intent: 'change', shape: 'Comment' })
    expect(noteType({ type: 'comment', geometry: null, time: 1 }).shape).toBe('Comment')
  })

  it('falls back to the type itself in sentence case', () => {
    expect(noteType({ type: 'lasso' }).shape).toBe('Lasso')
  })
})
