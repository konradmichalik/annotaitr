import { describe, it, expect } from 'vitest'
import { noteNumbers, noteLocation, sortNotes } from '../../../client/markdown/src/utils/noteNumbers.js'
import { exportMultiFileFeedback } from '../../../server/markdown/feedback.js'

const blocks = [
  { id: 'block-0', type: 'heading', content: 'Intro', startLine: 1 },
  { id: 'block-1', type: 'paragraph', content: 'First paragraph', startLine: 3 },
  { id: 'block-2', type: 'heading', content: 'Usage', startLine: 5 },
  { id: 'block-3', type: 'paragraph', content: 'Second paragraph', startLine: 7 }
]

const note = (id, blockId, startOffset, extra = {}) => ({
  id, blockId, startOffset, endOffset: startOffset + 3, type: 'COMMENT', originalText: 'abc', text: `note ${id}`, ...extra
})

describe('sortNotes', () => {
  it('orders by line, then by offset, like the feedback output', () => {
    const sorted = sortNotes([note('b', 'block-3', 0), note('c', 'block-1', 5), note('a', 'block-1', 1)], blocks)
    expect(sorted.map((n) => n.id)).toEqual(['a', 'c', 'b'])
  })
})

describe('noteNumbers', () => {
  it('numbers the notes of one file in document order, skipping general comments and agent notes', () => {
    const numbers = noteNumbers([{
      blocks,
      annotations: [
        note('late', 'block-3', 0),
        { id: 'general', type: 'COMMENT', targetType: 'global', text: 'overall' },
        { id: 'agent', type: 'NOTES', text: 'fyi', blockId: 'block-1' },
        note('early', 'block-1', 0)
      ]
    }])
    expect(Object.fromEntries(numbers)).toEqual({ early: 1, late: 2 })
  })

  it('continues the count across files, as the multi-file feedback does', () => {
    const files = [
      { path: 'a.md', blocks, annotations: [note('a1', 'block-1', 0), note('a2', 'block-3', 0)] },
      { path: 'empty.md', blocks, annotations: [] },
      { path: 'b.md', blocks, annotations: [note('b1', 'block-1', 0)] }
    ]
    const numbers = noteNumbers(files)
    expect(Object.fromEntries(numbers)).toEqual({ a1: 1, a2: 2, b1: 3 })
    const output = exportMultiFileFeedback(files)
    expect(output).toMatch(/### 3\.[^\n]*\n[\s\S]*note b1/)
  })
})

describe('noteLocation', () => {
  it('names the section and the line', () => {
    expect(noteLocation(note('x', 'block-3', 0), blocks)).toBe('Usage · L7')
    expect(noteLocation(note('x', 'block-1', 0), blocks)).toBe('Intro · L3')
  })

  it('reads the line of a note made in the source view', () => {
    expect(noteLocation(note('x', 'source-line-5', 0), blocks)).toBe('Usage · L6')
  })

  it('gives only the line before the first heading and nothing for an unknown block', () => {
    expect(noteLocation(note('x', 'block-1', 0), blocks.slice(1))).toBe('L3')
    expect(noteLocation(note('x', 'missing', 0), blocks)).toBeNull()
  })
})
