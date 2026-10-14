import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RepliesPanel, groupThreads } from '../../../client/markdown/src/components/RepliesPanel.jsx'

const thread = (handle, extra = {}) => ({
  handle, number: 1, anchor: 'exact', reason: null, element: null, file: '/abs/a.md',
  place: { path: 'a.md', where: 'Line 3', line: 3, quote: 'intro' },
  annotation: { type: 'COMMENT', text: 'Shorter' }, replies: [{ author: 'agent', status: 'question', text: 'How short?' }], ...extra
})

describe('groupThreads', () => {
  it('groups placed threads by file in order and puts orphans apart', () => {
    const threads = [
      thread('a1'), thread('b1', { place: { path: 'b.md', where: 'Line 1', line: 1 } }), thread('a2'),
      thread('o1', { anchor: 'orphan', reason: 'The text is no longer in the document', place: null })
    ]
    const { files, orphans } = groupThreads(threads)
    expect(files.map((f) => [f.path, f.threads.map((t) => t.handle)])).toEqual([['a.md', ['a1', 'a2']], ['b.md', ['b1']]])
    expect(orphans.map((t) => t.handle)).toEqual(['o1'])
  })

  it('keeps general comments with no place in a group of their own', () => {
    const { files } = groupThreads([thread('g1', { place: null, annotation: { type: 'COMMENT', targetType: 'global', text: 'Overall' } })])
    expect(files).toEqual([{ path: null, threads: [expect.objectContaining({ handle: 'g1' })] }])
  })
})

describe('RepliesPanel', () => {
  const render = (threads, extra = {}) => renderToStaticMarkup(
    <RepliesPanel round={1} threads={threads} multiFile={false} onLocate={() => {}} onReload={() => {}} {...extra} />
  )

  it('lists each thread with where it is now and the pending count', () => {
    const html = render([thread('a1', { anchor: 'moved', replies: [{ author: 'agent', status: 'question', text: 'How short?' }, { author: 'human', text: 'Two lines', pending: true }] })])
    expect(html).toContain('Round 1 replies')
    expect(html).toContain('· 1 to send')
    expect(html).toContain('Line 3 · moved')
    expect(html).toContain('Agent: How short?')
    expect(html).toContain('You: Two lines')
  })

  it('names the file of each group when several files are open', () => {
    expect(render([thread('a1')], { multiFile: true })).toContain('<h3 class="note-file-title">a.md</h3>')
  })

  it('lists text that is gone under its own heading with the original quote', () => {
    const html = render([thread('o1', { anchor: 'orphan', reason: 'The text is no longer in the document', place: null, quote: 'old intro' })])
    expect(html).toContain('No longer in the document')
    expect(html).toContain('The text is no longer in the document')
    expect(html).toContain('“old intro”')
  })
})
