import { describe, it, expect } from 'vitest'
import { formatAnnotationsForExport, formatAnnotationsForJsonExport, validateAnnotationImport } from '../../../client/markdown/src/utils/export.js'

const makeBlock = (overrides = {}) => ({
  id: 'block-0',
  type: 'paragraph',
  content: 'Hello world',
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
  createdAt: '2024-01-01T00:00:00Z',
  startMeta: { parentTagName: 'P', parentIndex: 0, textOffset: 0 },
  endMeta: { parentTagName: 'P', parentIndex: 0, textOffset: 5 },
  ...overrides
})

describe('formatAnnotationsForExport', () => {
  it('returns "No annotations." for empty array', () => {
    expect(formatAnnotationsForExport([], [], '/test.md')).toBe('No annotations.')
  })

  it('formats a COMMENT annotation', () => {
    const output = formatAnnotationsForExport([makeAnnotation()], [makeBlock()], '/test.md')
    expect(output).toContain('# Annotation Feedback')
    expect(output).toContain('**File:** `/test.md`')
    expect(output).toContain('**Count:** 1 annotation')
    expect(output).toContain('Comment (Line 1)')
    expect(output).toContain('```\nHello\n```')
    expect(output).toContain('> Fix this')
  })

  it('formats a DELETION annotation', () => {
    const ann = makeAnnotation({ type: 'DELETION', text: null, originalText: 'world' })
    const output = formatAnnotationsForExport([ann], [makeBlock()], '/test.md')
    expect(output).toContain('Remove (Line 1)')
  })

  it('calculates multi-line references', () => {
    const block = makeBlock({ content: 'Line one\nLine two\nLine three', startLine: 5 })
    const ann = makeAnnotation({ startOffset: 0, endOffset: 17, originalText: 'Line one\nLine two' })
    const output = formatAnnotationsForExport([ann], [block], '/test.md')
    expect(output).toContain('Lines 5-6')
  })

  it('sorts annotations by block then offset', () => {
    const blocks = [
      makeBlock({ id: 'block-0', startLine: 1 }),
      makeBlock({ id: 'block-1', startLine: 5 })
    ]
    const annotations = [
      makeAnnotation({ id: 'ann-2', blockId: 'block-1', startOffset: 0, originalText: 'Second' }),
      makeAnnotation({ id: 'ann-1', blockId: 'block-0', startOffset: 0, originalText: 'First' })
    ]
    const output = formatAnnotationsForExport(annotations, blocks, '/test.md')
    expect(output.indexOf('First')).toBeLessThan(output.indexOf('Second'))
  })

  it('appends the handle to the heading, like the stdout feedback', () => {
    const ann = makeAnnotation({ id: 'a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d' })
    const output = formatAnnotationsForExport([ann], [makeBlock()], '/test.md')
    expect(output).toContain('## 1. Comment (Line 1) [#a3f19c2e]\n')
  })

  it('gives a global comment a heading that carries its handle', () => {
    const ann = makeAnnotation({ id: '7b210e44-9f2c-4a1b-8e6d-3c7a5b9d1e2f', targetType: 'global', blockId: '', text: 'Overall fine' })
    const output = formatAnnotationsForExport([ann], [makeBlock()], '/test.md')
    expect(output).toContain('## General Feedback\n\n### General comment [#7b210e44]\n\n> Overall fine')
  })

  it('omits the handle when the id is not UUID-shaped', () => {
    const output = formatAnnotationsForExport([makeAnnotation()], [makeBlock()], '/test.md')
    expect(output).not.toContain('[#')
  })
})

describe('formatAnnotationsForJsonExport', () => {
  it('creates correct structure', () => {
    const ann = makeAnnotation()
    const result = formatAnnotationsForJsonExport([ann], '/test.md', 'abc123')
    expect(result.version).toBe(1)
    expect(result.filePath).toBe('/test.md')
    expect(result.contentHash).toBe('abc123')
    expect(result.exportedAt).toBeDefined()
    expect(result.annotations).toHaveLength(1)
  })

  it('includes all annotation fields', () => {
    const ann = makeAnnotation()
    const result = formatAnnotationsForJsonExport([ann], '/test.md', 'hash')
    const exported = result.annotations[0]
    expect(exported.id).toBe('ann-1')
    expect(exported.blockId).toBe('block-0')
    expect(exported.startOffset).toBe(0)
    expect(exported.endOffset).toBe(5)
    expect(exported.type).toBe('COMMENT')
    expect(exported.text).toBe('Fix this')
    expect(exported.originalText).toBe('Hello')
    expect(exported.startMeta).toBeDefined()
    expect(exported.endMeta).toBeDefined()
  })
})

describe('validateAnnotationImport', () => {
  const makeValidImport = (overrides = {}) => ({
    version: 1,
    filePath: '/test.md',
    contentHash: 'abc',
    annotations: [makeAnnotation()],
    ...overrides
  })

  it('accepts valid import data', () => {
    const result = validateAnnotationImport(makeValidImport())
    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
    expect(result.annotations).toHaveLength(1)
  })

  it('rejects null input', () => {
    const result = validateAnnotationImport(null)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid JSON format')
  })

  it('rejects non-object input', () => {
    expect(validateAnnotationImport('string').valid).toBe(false)
    expect(validateAnnotationImport(42).valid).toBe(false)
  })

  it('rejects wrong version', () => {
    const result = validateAnnotationImport(makeValidImport({ version: 2 }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Unsupported version')
  })

  it('rejects missing annotations array', () => {
    const result = validateAnnotationImport(makeValidImport({ annotations: 'not-array' }))
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Missing annotations array')
  })

  it('rejects too many annotations', () => {
    const annotations = Array.from({ length: 10001 }, (_, i) => makeAnnotation({ id: `ann-${i}` }))
    const result = validateAnnotationImport(makeValidImport({ annotations }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Too many annotations')
  })

  it('rejects annotation missing required field', () => {
    const ann = makeAnnotation()
    delete ann.blockId
    const result = validateAnnotationImport(makeValidImport({ annotations: [ann] }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('missing required field: blockId')
  })

  it('rejects non-string id', () => {
    const ann = makeAnnotation({ id: 123 })
    const result = validateAnnotationImport(makeValidImport({ annotations: [ann] }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('id and blockId must be strings')
  })

  it('rejects non-number offsets', () => {
    const ann = makeAnnotation({ startOffset: 'zero' })
    const result = validateAnnotationImport(makeValidImport({ annotations: [ann] }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('offsets must be numbers')
  })

  it('rejects negative offsets', () => {
    const ann = makeAnnotation({ startOffset: -1 })
    const result = validateAnnotationImport(makeValidImport({ annotations: [ann] }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid annotation offset')
  })

  it('rejects endOffset < startOffset', () => {
    const ann = makeAnnotation({ startOffset: 10, endOffset: 5 })
    const result = validateAnnotationImport(makeValidImport({ annotations: [ann] }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid annotation offset')
  })

  it('rejects invalid annotation type', () => {
    const ann = makeAnnotation({ type: 'HIGHLIGHT' })
    const result = validateAnnotationImport(makeValidImport({ annotations: [ann] }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid annotation type')
  })

  it('rejects non-string originalText', () => {
    const ann = makeAnnotation({ originalText: 123 })
    const result = validateAnnotationImport(makeValidImport({ annotations: [ann] }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('originalText must be a string')
  })

  it('accepts null text', () => {
    const ann = makeAnnotation({ text: null })
    const result = validateAnnotationImport(makeValidImport({ annotations: [ann] }))
    expect(result.valid).toBe(true)
  })

  it('accepts undefined text', () => {
    const ann = makeAnnotation({ text: undefined })
    const result = validateAnnotationImport(makeValidImport({ annotations: [ann] }))
    expect(result.valid).toBe(true)
  })

  it('rejects non-string text', () => {
    const ann = makeAnnotation({ text: 42 })
    const result = validateAnnotationImport(makeValidImport({ annotations: [ann] }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('text must be a string or null')
  })

  it('rejects non-object startMeta', () => {
    const ann = makeAnnotation({ startMeta: 'invalid' })
    const result = validateAnnotationImport(makeValidImport({ annotations: [ann] }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('startMeta must be an object')
  })

  it('rejects non-object endMeta', () => {
    const ann = makeAnnotation({ endMeta: null })
    const result = validateAnnotationImport(makeValidImport({ annotations: [ann] }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('endMeta must be an object')
  })

  it('returns filePath and contentHash from valid import', () => {
    const result = validateAnnotationImport(makeValidImport())
    expect(result.filePath).toBe('/test.md')
    expect(result.contentHash).toBe('abc')
  })

  it('defaults filePath and contentHash to null when missing', () => {
    const data = makeValidImport()
    delete data.filePath
    delete data.contentHash
    const result = validateAnnotationImport(data)
    expect(result.valid).toBe(true)
    expect(result.filePath).toBeNull()
    expect(result.contentHash).toBeNull()
  })
})
