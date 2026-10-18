import { describe, it, expect } from 'vitest'
import { decidedThreads } from '../../../server/markdown/sessionDecision.js'

const file = (absolutePath, path, content) => ({ absolutePath, path, content, contentHash: `h-${path}` })
const note = (id, originalText) => ({ id, type: 'COMMENT', blockId: 'block-0', startOffset: 0, endOffset: originalText.length, originalText, text: 'Fix', intent: 'change' })

describe('decidedThreads', () => {
  it('finds each note\'s file by its path, and by its position when the path is not one it knows', () => {
    const files = [file('/p/a.md', 'a.md', 'Alpha text\n'), file('/p/b.md', 'b.md', 'Beta text\n')]
    const submitted = [
      { path: 'renamed-a.md', annotations: [note('a1111111-0000-4000-8000-000000000000', 'Alpha')], blocks: [] },
      { path: 'b.md', annotations: [note('b2222222-0000-4000-8000-000000000000', 'Beta')], blocks: [] }
    ]
    const { threadFields } = decidedThreads(submitted, files)
    expect(threadFields['a1111111-0000-4000-8000-000000000000']).toMatchObject({ file: '/p/a.md', anchor: { quote: 'Alpha', contentHash: 'h-a.md' } })
    expect(threadFields['b2222222-0000-4000-8000-000000000000']).toMatchObject({ file: '/p/b.md', anchor: { quote: 'Beta' } })
  })

  it('keeps a note with no file to match without a file or anchor', () => {
    const submitted = [{ path: 'gone.md', annotations: [note('c3333333-0000-4000-8000-000000000000', 'Gone')], blocks: [] }]
    expect(decidedThreads(submitted, []).threadFields['c3333333-0000-4000-8000-000000000000']).toEqual({ file: null, anchor: null })
  })

  it('keeps only the names of attached images, whose files belong to this round', () => {
    const attached = { ...note('d4444444-0000-4000-8000-000000000000', 'Alpha'), attachments: [{ path: '/tmp/annotaitr-attachments/x.png', name: 'shot.png' }] }
    const { annotations } = decidedThreads([{ path: 'a.md', annotations: [attached], blocks: [] }], [file('/p/a.md', 'a.md', 'Alpha text\n')])
    expect(annotations[0].attachments).toEqual([{ name: 'shot.png' }])
  })
})
