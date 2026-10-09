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
  it('reads the stable number of every numbered note, gaps included', () => {
    const numbers = noteNumbers([{
      blocks,
      annotations: [
        note('late', 'block-3', 0, { number: 1 }),
        { id: 'general', type: 'COMMENT', targetType: 'global', text: 'overall' },
        { id: 'agent', type: 'NOTES', text: 'fyi', blockId: 'block-1' },
        note('early', 'block-1', 0, { number: 4 })
      ]
    }])
    expect(Object.fromEntries(numbers)).toEqual({ late: 1, early: 4 })
  })

  it('reads the numbers of every file, as the multi-file feedback prints them', () => {
    const files = [
      { path: 'a.md', blocks, annotations: [note('a1', 'block-1', 0, { number: 1 }), note('a2', 'block-3', 0, { number: 3 })] },
      { path: 'empty.md', blocks, annotations: [] },
      { path: 'b.md', blocks, annotations: [note('b1', 'block-1', 0, { number: 2 })] }
    ]
    const numbers = noteNumbers(files)
    expect(Object.fromEntries(numbers)).toEqual({ a1: 1, a2: 3, b1: 2 })
    const output = exportMultiFileFeedback(files)
    expect(output).toMatch(/### 2\.[^\n]*\n[\s\S]*note b1/)
  })
})

describe('noteLocation', () => {
  it('names the file and its new or old line for a note on a diff, as the feedback does', () => {
    const content = '@@ -41,2 +41,3 @@\n a\n-b\n+c\n+d'
    const diff = [{ id: 'd', type: 'code', language: 'diff src/Foo.php', content, startLine: 10 }]
    const at = content.indexOf('+c')
    expect(noteLocation({ ...note('x', 'd', at), originalText: '+c\n+d' }, diff)).toBe('Foo.php · new L42-43')
    expect(noteLocation({ ...note('x', 'd', content.indexOf('-b')), originalText: '-b' }, diff)).toBe('Foo.php · old L42')
  })

  it('drops the code marks around a path heading', () => {
    const walk = [{ id: 'h', type: 'heading', content: '`src/a.js` (new file)', startLine: 1 }, { id: 'p', type: 'paragraph', content: 'Why', startLine: 3 }]
    expect(noteLocation(note('x', 'p', 0), walk)).toBe('src/a.js (new file) · L3')
  })

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

  it('drops raw HTML from a heading and falls back to the line when nothing is left', () => {
    const html = [
      { id: 'h1', type: 'heading', content: '<picture><img alt="logo" src="logo.svg"></picture>', startLine: 1 },
      { id: 'h2', type: 'heading', content: '<b>Usage</b> guide', startLine: 5 },
      { id: 'p1', type: 'paragraph', content: 'text', startLine: 3 },
      { id: 'p2', type: 'paragraph', content: 'text', startLine: 7 }
    ]
    expect(noteLocation(note('x', 'p1', 0), html)).toBe('L3')
    expect(noteLocation(note('x', 'p2', 0), html)).toBe('Usage guide · L7')
  })
})
