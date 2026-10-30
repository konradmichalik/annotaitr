// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { highlightClassOf } from '../../../client/markdown/src/hooks/useHighlighter.js'

describe('highlightClassOf', () => {
  it('strikes a deletion through', () => {
    expect(highlightClassOf('DELETION')).toBe('deletion')
  })

  it('strikes a comment through that is still a removal, so adding words to a removal keeps its look', () => {
    expect(highlightClassOf('COMMENT', 'remove')).toBe('deletion')
  })

  it('leaves an ordinary comment, with or without a kind, a comment', () => {
    expect(highlightClassOf('COMMENT')).toBe('comment')
    expect(highlightClassOf('COMMENT', 'comment')).toBe('comment')
  })

  it('names any other type after itself, as the agent notes are', () => {
    expect(highlightClassOf('NOTES')).toBe('notes')
  })
})
