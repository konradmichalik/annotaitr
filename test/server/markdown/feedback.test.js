import { describe, it, expect } from 'vitest'
import { exportFeedback, exportMultiFileFeedback, formatApprovalOutput, intentSummary } from '../../../server/markdown/feedback.js'

const makeBlock = (overrides = {}) => ({
  id: 'block-0',
  type: 'paragraph',
  content: 'Hello world this is a test',
  startLine: 1,
  ...overrides
})

const makeAnnotation = (overrides = {}) => ({
  id: 'ann-1',
  blockId: 'block-0',
  startOffset: 0,
  endOffset: 5,
  type: 'COMMENT',
  text: 'Fix this',
  originalText: 'Hello',
  ...overrides
})

describe('exportFeedback', () => {
  it('returns "No annotations." for empty array', () => {
    expect(exportFeedback([], [])).toBe('No annotations.')
  })

  it('formats a single COMMENT annotation', () => {
    const blocks = [makeBlock()]
    const annotations = [makeAnnotation()]
    const output = exportFeedback(annotations, blocks)

    expect(output).toContain('# Annotation Feedback')
    expect(output).toContain('1 annotation (1 Change):')
    expect(output).toContain('## 1. Change · Text (Line 1)')
    expect(output).toContain('```\nHello\n```')
    expect(output).toContain('> Fix this')
  })

  it('formats a single DELETION annotation', () => {
    const blocks = [makeBlock()]
    const annotations = [makeAnnotation({ type: 'DELETION', text: null, originalText: 'world' })]
    const output = exportFeedback(annotations, blocks)

    expect(output).toContain('## 1. Remove · Text (Line 1)')
    expect(output).toContain('```\nworld\n```')
    expect(output).toContain('> User wants this removed')
  })

  it('pluralizes annotation count', () => {
    const blocks = [makeBlock()]
    const annotations = [
      makeAnnotation({ id: 'ann-1' }),
      makeAnnotation({ id: 'ann-2', startOffset: 6, endOffset: 11, originalText: 'world' })
    ]
    const output = exportFeedback(annotations, blocks)
    expect(output).toContain('2 annotations (2 Change):')
  })

  it('calculates line numbers for selections with offset', () => {
    const block = makeBlock({ content: 'Line one\nLine two\nLine three', startLine: 10 })
    const ann = makeAnnotation({ startOffset: 9, endOffset: 17, originalText: 'Line two' })
    const output = exportFeedback([ann], [block])
    expect(output).toContain('Line 11')
  })

  it('calculates line range for multi-line selections', () => {
    const block = makeBlock({ content: 'Line one\nLine two\nLine three', startLine: 1 })
    const ann = makeAnnotation({
      startOffset: 0,
      endOffset: 17,
      originalText: 'Line one\nLine two'
    })
    const output = exportFeedback([ann], [block])
    expect(output).toContain('Lines 1-2')
  })

  it('sorts annotations by block order then offset', () => {
    const blocks = [
      makeBlock({ id: 'block-0', startLine: 1 }),
      makeBlock({ id: 'block-1', startLine: 5 })
    ]
    const annotations = [
      makeAnnotation({ id: 'ann-2', blockId: 'block-1', startOffset: 0, originalText: 'Second' }),
      makeAnnotation({ id: 'ann-1', blockId: 'block-0', startOffset: 0, originalText: 'First' })
    ]
    const output = exportFeedback(annotations, blocks)
    const firstIdx = output.indexOf('First')
    const secondIdx = output.indexOf('Second')
    expect(firstIdx).toBeLessThan(secondIdx)
  })

  it('includes label tag in comment heading when label is present', () => {
    const blocks = [makeBlock()]
    const annotations = [makeAnnotation({
      label: { id: 'unclear', emoji: '\u2753', text: 'Unclear', color: 'yellow' }
    })]
    const output = exportFeedback(annotations, blocks)
    expect(output).toContain('Change · Text (Line 1) [\u2753 Unclear]')
  })

  it('omits label tag when label is absent', () => {
    const blocks = [makeBlock()]
    const annotations = [makeAnnotation()]
    const output = exportFeedback(annotations, blocks)
    expect(output).toContain('Change · Text (Line 1)\n')
    expect(output).not.toContain('[')
  })

  it('ends with ---', () => {
    const output = exportFeedback([makeAnnotation()], [makeBlock()])
    expect(output).toMatch(/---\n$/)
  })
})

describe('exportMultiFileFeedback', () => {
  it('returns "No annotations." when no files have annotations', () => {
    const files = [{ path: '/a.md', annotations: [], blocks: [] }]
    expect(exportMultiFileFeedback(files)).toBe('No annotations.')
  })

  it('delegates to exportFeedback for single file', () => {
    const files = [{
      path: '/a.md',
      annotations: [makeAnnotation()],
      blocks: [makeBlock()]
    }]
    const output = exportMultiFileFeedback(files)
    expect(output).toContain('# Annotation Feedback')
    expect(output).not.toContain('## File:')
  })

  it('groups annotations by file for multi-file', () => {
    const files = [
      {
        path: '/a.md',
        annotations: [makeAnnotation({ id: 'ann-1' })],
        blocks: [makeBlock()]
      },
      {
        path: '/b.md',
        annotations: [makeAnnotation({ id: 'ann-2' })],
        blocks: [makeBlock()]
      }
    ]
    const output = exportMultiFileFeedback(files)
    expect(output).toContain('## File: /a.md')
    expect(output).toContain('## File: /b.md')
    expect(output).toContain('2 annotations (2 Change) across 2 files')
  })

  it('uses global numbering across files', () => {
    const files = [
      {
        path: '/a.md',
        annotations: [makeAnnotation({ id: 'ann-1' })],
        blocks: [makeBlock()]
      },
      {
        path: '/b.md',
        annotations: [makeAnnotation({ id: 'ann-2' })],
        blocks: [makeBlock()]
      }
    ]
    const output = exportMultiFileFeedback(files)
    expect(output).toContain('### 1.')
    expect(output).toContain('### 2.')
  })

  it('formats pinpoint annotations with block content', () => {
    const blocks = [makeBlock({ content: 'Some paragraph text here' })]
    const annotations = [makeAnnotation({
      targetType: 'pinpoint',
      type: 'COMMENT',
      text: 'This paragraph needs rewriting',
      originalText: 'Some paragraph text here'
    })]
    const output = exportFeedback(annotations, blocks)
    expect(output).toContain('## 1. Change · Block (Line 1)')
    expect(output).toContain('Some paragraph text here')
    expect(output).toContain('> This paragraph needs rewriting')
  })

  it('formats pinpoint deletion annotations', () => {
    const blocks = [makeBlock({ content: 'Remove this block entirely' })]
    const annotations = [makeAnnotation({
      targetType: 'pinpoint',
      type: 'DELETION',
      originalText: 'Remove this block entirely'
    })]
    const output = exportFeedback(annotations, blocks)
    expect(output).toContain('## 1. Remove · Block (Line 1)')
    expect(output).toContain('User wants this block removed')
  })

  it('formats a token annotation as comment', () => {
    const blocks = [makeBlock({ type: 'code', content: 'const processOrder = () => {}', language: 'javascript', startLine: 10 })]
    const annotations = [makeAnnotation({
      targetType: 'token',
      type: 'COMMENT',
      text: 'Rename this function',
      originalText: 'processOrder',
      startOffset: 6,
      endOffset: 18
    })]
    const output = exportFeedback(annotations, blocks)
    expect(output).toContain('## 1. Change · Token (Line 10)')
    expect(output).toContain('Token: `processOrder`')
    expect(output).toContain('> Rename this function')
    expect(output).toContain('Line 10')
  })

  it('formats a token deletion annotation', () => {
    const blocks = [makeBlock({ type: 'code', content: 'let x = 1\nlet y = 2', language: 'javascript', startLine: 5 })]
    const annotations = [makeAnnotation({
      targetType: 'token',
      type: 'DELETION',
      originalText: 'y',
      startOffset: 14,
      endOffset: 15
    })]
    const output = exportFeedback(annotations, blocks)
    expect(output).toContain('## 1. Remove · Token (Line 6)')
    expect(output).toContain('Line 6')
    expect(output).toContain('Token: `y`')
  })

  it('skips files without annotations and uses single-file format', () => {
    const files = [
      { path: '/a.md', annotations: [], blocks: [] },
      {
        path: '/b.md',
        annotations: [makeAnnotation()],
        blocks: [makeBlock()]
      }
    ]
    const output = exportMultiFileFeedback(files)
    expect(output).not.toContain('## File: /a.md')
    // Single annotated file → delegates to single-file format (no file headers)
    expect(output).not.toContain('## File: /b.md')
    expect(output).toContain('1 annotation')
  })
})

describe('annotation handles', () => {
  const UUID_A = 'a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d'
  const UUID_B = '7b210e44-9f2c-4a1b-8e6d-3c7a5b9d1e2f'

  it('appends the handle to a comment heading', () => {
    const output = exportFeedback([makeAnnotation({ id: UUID_A })], [makeBlock()])
    expect(output).toContain('## 1. Change · Text (Line 1) [#a3f19c2e]')
  })

  it('appends the handle after an existing quick-label tag', () => {
    const annotations = [makeAnnotation({
      id: UUID_A,
      label: { id: 'unclear', emoji: '❓', text: 'Unclear', color: 'yellow' }
    })]
    const output = exportFeedback(annotations, [makeBlock()])
    expect(output).toContain('Change · Text (Line 1) [❓ Unclear] [#a3f19c2e]')
  })

  it('appends the handle to a deletion heading', () => {
    const annotations = [makeAnnotation({ id: UUID_A, type: 'DELETION', text: null, originalText: 'world' })]
    const output = exportFeedback(annotations, [makeBlock()])
    expect(output).toContain('## 1. Remove · Text (Line 1) [#a3f19c2e]')
  })

  it('appends the handle to an element-level heading', () => {
    const blocks = [makeBlock({ type: 'code', content: 'graph TD', language: 'mermaid' })]
    const annotations = [makeAnnotation({ id: UUID_A, targetType: 'diagram', text: 'Redraw this' })]
    const output = exportFeedback(annotations, blocks)
    expect(output).toContain('## 1. Change · Mermaid diagram (Line 1) [#a3f19c2e]')
  })

  it('gives a global comment a heading carrying its handle', () => {
    const annotations = [makeAnnotation({
      id: UUID_A,
      targetType: 'global',
      text: 'The document needs an intro.',
      originalText: ''
    })]
    const output = exportFeedback(annotations, [makeBlock()])
    expect(output).toContain('### General comment [#a3f19c2e]')
    expect(output).toContain('> The document needs an intro.')
  })

  it('uses a deeper global-comment heading in multi-file output', () => {
    const files = [
      {
        path: '/a.md',
        annotations: [makeAnnotation({ id: UUID_A, targetType: 'global', text: 'Needs an intro.' })],
        blocks: [makeBlock()]
      },
      {
        path: '/b.md',
        annotations: [makeAnnotation({ id: UUID_B })],
        blocks: [makeBlock()]
      }
    ]
    const output = exportMultiFileFeedback(files)
    expect(output).toContain('#### General comment [#a3f19c2e]')
    expect(output).toContain('### 1. Change · Text (Line 1) [#7b210e44]')
  })

  it('omits the handle when the id is not UUID-shaped', () => {
    const output = exportFeedback([makeAnnotation({ id: 'ann-1' })], [makeBlock()])
    expect(output).toContain('## 1. Change · Text (Line 1)\n')
    expect(output).not.toContain('[#')
  })
})

describe('intents and stable numbers', () => {
  it('prints each note under the number it carries, gaps included', () => {
    const blocks = [makeBlock({ id: 'block-0', startLine: 1 }), makeBlock({ id: 'block-1', startLine: 5 })]
    const output = exportFeedback([
      makeAnnotation({ id: 'late', blockId: 'block-1', number: 1, originalText: 'Later' }),
      makeAnnotation({ id: 'early', number: 3, intent: 'question', text: 'Why?' })
    ], blocks)
    expect(output).toContain('2 annotations (1 Change, 1 Question):')
    expect(output).toContain('## 3. Question · Text (Line 1)')
    expect(output).toContain('## 1. Change · Text (Line 5)')
    expect(output).not.toContain('## 2.')
    expect(output.indexOf('## 3.')).toBeLessThan(output.indexOf('## 1.'))
  })

  it('prints an insertion as Add with the text to insert', () => {
    const output = exportFeedback([makeAnnotation({
      type: 'INSERTION', text: 'new words', originalText: '', afterContext: 'Hello', startOffset: 5, endOffset: 5
    })], [makeBlock()])
    expect(output).toContain('## 1. Add · Insertion (Line 1)')
    expect(output).toContain('After: `Hello`')
    expect(output).toContain('```\nnew words\n```')
  })

  it('prints a comment marked Remove with its text', () => {
    const output = exportFeedback([makeAnnotation({ intent: 'remove', text: 'Drop the greeting' })], [makeBlock()])
    expect(output).toContain('## 1. Remove · Text (Line 1)')
    expect(output).toContain('> Drop the greeting')
  })

  it('numbers old notes without numbers in document order and counts the general comment', () => {
    const blocks = [makeBlock({ id: 'block-0', startLine: 1 }), makeBlock({ id: 'block-1', startLine: 5 })]
    const output = exportFeedback([
      makeAnnotation({ id: 'g', targetType: 'global', text: 'Overall fine' }),
      makeAnnotation({ id: 'late', blockId: 'block-1', type: 'DELETION', originalText: 'Later' }),
      makeAnnotation({ id: 'early' })
    ], blocks)
    expect(output).toContain('3 annotations (1 Change, 1 Remove, 1 General):')
    expect(output).toContain('## 1. Change · Text (Line 1)')
    expect(output).toContain('## 2. Remove · Text (Line 5)')
  })

  it('keeps the numbers across files and numbers old notes after them', () => {
    const files = [
      { path: '/a.md', annotations: [makeAnnotation({ id: 'a1', number: 4 }), makeAnnotation({ id: 'a2', startOffset: 6, originalText: 'world' })], blocks: [makeBlock()] },
      { path: '/b.md', annotations: [makeAnnotation({ id: 'b1', number: 2, text: 'note b1' })], blocks: [makeBlock()] }
    ]
    const output = exportMultiFileFeedback(files)
    expect(output).toContain('### 4. Change · Text (Line 1)')
    expect(output).toContain('### 5. Change · Text (Line 1)')
    expect(output).toMatch(/### 2\. Change · Text \(Line 1\)\n[^#]*note b1/)
  })
})

describe('intentSummary', () => {
  it('counts the notes of every file by intent, without agent notes', () => {
    const files = [
      { path: '/a.md', annotations: [makeAnnotation(), { type: 'NOTES', text: 'fyi' }], blocks: [] },
      { path: '/b.md', annotations: [makeAnnotation({ type: 'DELETION' })], blocks: [] }
    ]
    expect(intentSummary(files)).toBe('1 Change, 1 Remove')
  })
})

describe('formatApprovalOutput', () => {
  it('emits the plain approval marker when no notes were left', () => {
    const output = formatApprovalOutput({ approved: true })

    expect(output).toBe('APPROVED: No changes requested.\n')
  })

  it('emits the notes marker with the count and the formatted notes', () => {
    const output = formatApprovalOutput({
      approved: true,
      annotationCount: 2,
      intents: '1 Change, 1 Question',
      feedback: '# Annotation Feedback\n\nsome notes\n'
    })

    expect(output).toContain('APPROVED WITH NOTES: 2 notes (1 Change, 1 Question).')
    expect(output).toContain('approved as-is')
    expect(output).toContain('not as change requests')
    expect(output).toContain('# Annotation Feedback')
  })

  it('uses the singular form for a single note', () => {
    const output = formatApprovalOutput({ approved: true, annotationCount: 1, feedback: 'note' })

    expect(output).toContain('APPROVED WITH NOTES: 1 note.')
    expect(output).not.toContain('1 notes')
  })

  it('never emits the plain approval marker alongside notes', () => {
    const output = formatApprovalOutput({ approved: true, annotationCount: 1, feedback: 'note' })

    expect(output.startsWith('APPROVED:')).toBe(false)
  })
})
