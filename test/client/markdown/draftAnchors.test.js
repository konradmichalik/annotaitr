import { describe, it, expect } from 'vitest'
import { reanchorAnnotations, reanchorSourceNotes } from '../../../client/markdown/src/utils/draftAnchors.js'

const meta = { parentTagName: 'P', parentIndex: 0, textOffset: 0 }

const note = (overrides = {}) => ({
  id: 'ann-1',
  blockId: 'block-1',
  startOffset: 6,
  endOffset: 11,
  type: 'COMMENT',
  text: 'Fix this',
  originalText: 'world',
  startMeta: meta,
  endMeta: meta,
  ...overrides
})

const blocks = [
  { id: 'block-0', text: 'Intro' },
  { id: 'block-1', text: 'Hello world' }
]

describe('reanchorAnnotations: text selections', () => {
  it('keeps a note whose block still holds its text at the stored offsets', () => {
    const ann = note()
    const [result] = reanchorAnnotations([ann], blocks)
    expect(result).toBe(ann)
  })

  it('moves a note to the block that now holds its text', () => {
    const moved = [
      { id: 'block-0', text: 'Intro' },
      { id: 'block-1', text: 'A new paragraph' },
      { id: 'block-2', text: 'Say hello world twice: world' }
    ]
    const [result] = reanchorAnnotations([note()], moved)
    expect(result.blockId).toBe('block-2')
    expect(result.startOffset).toBe(10)
    expect(result.endOffset).toBe(15)
    expect(result.unanchored).toBeUndefined()
    expect(result.text).toBe('Fix this')
  })

  it('takes the occurrence in its own block closest to the old offset', () => {
    const [result] = reanchorAnnotations([note({ startOffset: 20, endOffset: 25 })], [
      { id: 'block-0', text: 'world' },
      { id: 'block-1', text: 'world, a world, the big world' }
    ])
    expect(result.blockId).toBe('block-1')
    expect(result.startOffset).toBe(24)
    expect(result.endOffset).toBe(29)
  })

  it('searches the blocks nearest to its old block first, not the top of the file', () => {
    const texts = ['the a', 'b', 'c', 'the d', 'e', 'f', 'g', 'the h'].map((text, i) => ({ id: `block-${i}`, text }))
    const ann = note({ blockId: 'block-5', startOffset: 0, endOffset: 3, originalText: 'the' })
    const [result] = reanchorAnnotations([ann], texts)
    expect(result.blockId).toBe('block-3')
    expect(result.startOffset).toBe(0)
  })

  it('looks from its old position when its block id no longer exists', () => {
    const texts = [{ id: 'block-0', text: 'the a' }, { id: 'block-1', text: 'the b' }]
    const [result] = reanchorAnnotations([note({ blockId: 'block-9', startOffset: 0, endOffset: 3, originalText: 'the' })], texts)
    expect(result.blockId).toBe('block-1')
  })

  it('marks a note unanchored when its text is gone and keeps its fields', () => {
    const [result] = reanchorAnnotations([note()], [{ id: 'block-1', text: 'Hello there' }])
    expect(result.unanchored).toBe(true)
    expect(result.blockId).toBe('block-1')
    expect(result.startOffset).toBe(6)
    expect(result.originalText).toBe('world')
  })

  it('drops the unanchored mark once the text is found again', () => {
    const [result] = reanchorAnnotations([note({ unanchored: true })], blocks)
    expect(result.unanchored).toBeUndefined()
    expect(result.blockId).toBe('block-1')
    expect(result.startOffset).toBe(6)
  })

  it('keeps a selection across blocks while the blocks it spans are unchanged', () => {
    const texts = [{ id: 'block-0', text: 'One two' }, { id: 'block-1', text: 'three four' }]
    const ann = note({ blockId: 'block-0', startOffset: 4, endOffset: 4 + 'twothree'.length, originalText: 'twothree' })
    expect(reanchorAnnotations([ann], texts)[0]).toBe(ann)
    const [changed] = reanchorAnnotations([ann], [{ id: 'block-0', text: 'One two' }, { id: 'block-1', text: 'five' }])
    expect(changed.unanchored).toBe(true)
  })

  it('does not mutate the notes it is given', () => {
    const ann = note({ blockId: 'block-0' })
    reanchorAnnotations([ann], blocks)
    expect(ann.blockId).toBe('block-0')
    expect(ann.startOffset).toBe(6)
  })
})

describe('reanchorAnnotations: tokens and elements', () => {
  const always = () => true
  const never = () => false

  it('re-anchors a token like a text selection when the element check confirms it', () => {
    const token = note({ targetType: 'token', blockId: 'block-0', startOffset: 0, endOffset: 5, startMeta: null, endMeta: null })
    const [result] = reanchorAnnotations([token], blocks, always)
    expect(result.blockId).toBe('block-1')
    expect(result.startOffset).toBe(6)
  })

  it('marks a token unanchored when the element check finds no token there', () => {
    const token = note({ targetType: 'token' })
    const [result] = reanchorAnnotations([token], blocks, never)
    expect(result.unanchored).toBe(true)
  })

  it('keeps an element note on its block when it still matches, moves it to the nearest block that does', () => {
    const texts = ['a', 'b', 'c', 'd'].map((text, i) => ({ id: `block-${i}`, text }))
    const image = note({ targetType: 'image', blockId: 'block-1', startOffset: 0, endOffset: 0, imageSrc: 'x.png' })
    expect(reanchorAnnotations([image], texts, always)[0]).toBe(image)
    const [moved] = reanchorAnnotations([image], texts, (_ann, blockId) => blockId === 'block-3' || blockId === 'block-0')
    expect(moved.blockId).toBe('block-0')
    expect(moved.startOffset).toBe(0)
  })

  it('marks an element note unanchored when no block matches it', () => {
    for (const targetType of ['image', 'diagram', 'math', 'pinpoint', 'link']) {
      const [result] = reanchorAnnotations([note({ targetType })], blocks, never)
      expect(result.unanchored).toBe(true)
    }
  })

  it('leaves agent notes, general comments and source view notes untouched', () => {
    const general = { id: 'g', type: 'COMMENT', targetType: 'global', text: 'Overall', originalText: '' }
    const agent = note({ id: 'a', type: 'NOTES', originalText: 'gone' })
    const source = note({ id: 's', targetType: 'source', blockId: 'source-line-3', originalText: 'gone' })
    const input = [general, agent, source]
    const result = reanchorAnnotations(input, blocks, never)
    result.forEach((ann, i) => expect(ann).toBe(input[i]))
  })
})

describe('reanchorAnnotations: insertions', () => {
  const insertion = (overrides) => note({ type: 'INSERTION', originalText: '', text: 'new', ...overrides })

  it('keeps an insertion whose text before it is unchanged', () => {
    const ann = insertion({ blockId: 'block-1', startOffset: 5, endOffset: 5, afterContext: 'Hello' })
    expect(reanchorAnnotations([ann], blocks)[0]).toBe(ann)
  })

  it('moves an insertion to where the text before it is now', () => {
    const ann = insertion({ blockId: 'block-1', startOffset: 5, endOffset: 5, afterContext: 'Hello' })
    const [result] = reanchorAnnotations([ann], [{ id: 'block-0', text: 'Intro' }, { id: 'block-1', text: 'New' }, { id: 'block-2', text: 'Say Hello there' }])
    expect(result.blockId).toBe('block-2')
    expect(result.startOffset).toBe(9)
    expect(result.endOffset).toBe(9)
  })

  it('marks an insertion unanchored when the text before it is gone or was empty', () => {
    const gone = insertion({ afterContext: 'Nowhere' })
    const atStart = insertion({ startOffset: 0, endOffset: 0, afterContext: '' })
    const [first, second] = reanchorAnnotations([gone, atStart], blocks)
    expect(first.unanchored).toBe(true)
    expect(second.unanchored).toBe(true)
  })
})

describe('reanchorSourceNotes', () => {
  const source = (overrides) => note({ targetType: 'source', blockId: 'source-line-1', startOffset: 6, endOffset: 11, ...overrides })

  it('moves a source view note to the line its text is on now, with metas for that line', () => {
    const [result] = reanchorSourceNotes([source()], 'Intro\nnew line\n\nHello world')
    expect(result.blockId).toBe('source-line-3')
    expect(result.startOffset).toBe(6)
    expect(result.startMeta).toEqual({ parentTagName: 'TD', parentIndex: 7, textOffset: 6 })
    expect(result.endMeta).toEqual({ parentTagName: 'TD', parentIndex: 7, textOffset: 11 })
  })

  it('marks a source view note unanchored when its text is gone, and leaves other notes alone', () => {
    const other = note()
    const [result, untouched] = reanchorSourceNotes([source(), other], 'Intro\nHello there')
    expect(result.unanchored).toBe(true)
    expect(untouched).toBe(other)
  })
})
