import { describe, it, expect } from 'vitest'
import { createAnchor, locateThread, anchorThreads, project } from '../../../server/markdown/anchorThreads.js'

const DOC = '# Title\n\nThe intro says hello.\n\nA second paragraph with **bold words** in it.\n'
const file = (content, extra = {}) => ({ absolutePath: '/abs/a.md', path: 'a.md', content, contentHash: `hash-${content.length}`, ...extra })
const note = (extra) => ({ id: 'a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d', type: 'COMMENT', blockId: 'block-1', startOffset: 4, text: 'Shorter', ...extra })
const paragraph = { id: 'block-1', type: 'paragraph', startLine: 3, content: 'The intro says hello.' }

function threadFor(annotation, block, content) {
  return { handle: 'a3f19c2e', number: 1, annotation, element: null, file: '/abs/a.md', anchor: createAnchor(annotation, block, file(content)), replies: [] }
}

describe('project', () => {
  it('drops markup and whitespace so rendered text and source compare', () => {
    expect(project('A **bold** [link](http://x) `code`\n> quoted').text).toBe('Aboldlinkcodequoted')
  })

  it('maps every projected character back to the source', () => {
    const { text, map } = project('a **b**')
    expect(text).toBe('ab')
    expect(map).toEqual([0, 4])
  })
})

describe('createAnchor', () => {
  it('keeps the quote, the text around it, the place and the hash of the file it was made on', () => {
    const anchor = createAnchor(note({ originalText: 'intro says' }), paragraph, file(DOC))
    expect(anchor).toEqual({ quote: 'intro says', prefix: 'TitleThe', suffix: 'hello.Asecondparagraphwithboldwo', where: 'Line 3', contentHash: `hash-${DOC.length}` })
  })

  it('anchors an insertion on the text before it and gives a general comment none', () => {
    const insertion = note({ type: 'INSERTION', originalText: '', afterContext: 'says hello.', startOffset: 21 })
    expect(createAnchor(insertion, paragraph, file(DOC)).quote).toBe('says hello.')
    expect(createAnchor(note({ targetType: 'global', originalText: '' }), null, file(DOC))).toBeNull()
  })
})

describe('locateThread', () => {
  const round1 = threadFor(note({ originalText: 'intro says' }), paragraph, DOC)

  it('is exact on the unchanged file and keeps the place', () => {
    expect(locateThread(round1, file(DOC))).toEqual({ anchor: 'exact', reason: null, place: { path: 'a.md', where: 'Line 3', line: 3, quote: 'intro says' } })
  })

  it('moves to the one place the quote is now', () => {
    const edited = `# Title\n\nNew first paragraph.\n\n${DOC.slice(9)}`
    expect(locateThread(round1, file(edited))).toEqual({ anchor: 'moved', reason: null, place: { path: 'a.md', where: 'Line 5', line: 5, quote: 'intro says' } })
  })

  it('finds a quote across inline markup', () => {
    const bold = threadFor(note({ originalText: 'bold words', blockId: 'block-2' }), { id: 'block-2', startLine: 5, content: 'A second paragraph with **bold words** in it.' }, DOC)
    expect(locateThread(bold, file(`Intro.\n\n${DOC}`)).place.where).toBe('Line 7')
  })

  it('tells several places apart by the text around the quote, and orphans what it cannot tell apart', () => {
    const twice = 'The intro says hello.\n\nOther text: intro says no.\n'
    const thread = threadFor(note({ originalText: 'intro says', startOffset: 4 }), { ...paragraph, startLine: 1 }, twice)
    expect(locateThread(thread, file(`New.\n\n${twice}`))).toMatchObject({ anchor: 'moved', place: { line: 3 } })
    const ambiguous = { ...thread, anchor: { ...thread.anchor, prefix: 'gone', suffix: 'gone' } }
    expect(locateThread(ambiguous, file(`New.\n\n${twice}`))).toEqual({ anchor: 'orphan', reason: 'The text now appears in several places', place: null })
  })

  it('orphans a deleted quote and a file that left the review', () => {
    expect(locateThread(round1, file('# Title\n\nAll new.\n'))).toEqual({ anchor: 'orphan', reason: 'The text is no longer in the document', place: null })
    expect(locateThread(round1, undefined)).toEqual({ anchor: 'orphan', reason: 'The file is no longer part of this review', place: null })
  })

  it('keeps a general comment exact whatever changed', () => {
    const general = { ...round1, annotation: note({ targetType: 'global', originalText: '' }), anchor: null }
    expect(locateThread(general, file('changed'))).toEqual({ anchor: 'exact', reason: null, place: null })
  })

  it('names the changed file and line of a quote inside a diff block', () => {
    const walkthrough = '## src/a.js\n\n````diff src/a.js\n@@ -1,2 +1,2 @@\n const a = 1\n-const b = 2\n+const b = 3\n````\n'
    const thread = threadFor(note({ originalText: 'const b = 3' }), { id: 'block-1', type: 'code', startLine: 3, content: '' }, walkthrough)
    expect(locateThread(thread, file(`Intro.\n\n${walkthrough}`)).place.where).toBe('new Line 2 in src/a.js')
  })
})

describe('anchorThreads', () => {
  it('places every thread of the last round against the files of this one', () => {
    const thread = threadFor(note({ originalText: 'intro says' }), paragraph, DOC)
    expect(anchorThreads(null, [])).toEqual([])
    const [placed] = anchorThreads({ round: 1, threads: [thread] }, [file(DOC)])
    expect(placed).toMatchObject({ handle: 'a3f19c2e', anchor: 'exact', place: { line: 3 }, file: '/abs/a.md' })
    const [gone] = anchorThreads({ round: 1, threads: [thread] }, [file('# Other\n')])
    expect(gone).toMatchObject({ anchor: 'orphan', place: null, quote: 'intro says' })
  })
})

describe('anchoring a large file', () => {
  // 40 000 lines that all hold the quote: a scan of the file per occurrence or per thread takes minutes.
  const big = Array.from({ length: 40_000 }, (_, i) => `Row ${i} says repeat here.`).join('\n')

  it('picks the occurrence nearest the note without rescanning the file for each one', () => {
    const started = performance.now()
    const anchor = createAnchor(note({ blockId: 'source-line-29999', originalText: 'repeat' }), null, file(big))
    expect(anchor.prefix).toContain('29999says')
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('reads each file once for all of last round\'s threads', () => {
    const current = file(`${big}\nmoved`)
    const threads = Array.from({ length: 300 }, (_, i) => ({
      handle: `h${i}`, number: i + 1, annotation: note({ originalText: `Row ${i} says` }), element: null, file: '/abs/a.md', replies: [],
      anchor: { quote: i === 3 ? 'Absent words' : `Row ${i * 100} says`, prefix: '', suffix: '', where: 'Line 1', contentHash: 'old' }
    }))
    const started = performance.now()
    const placed = anchorThreads({ round: 1, threads }, [current])
    expect(placed[3]).toMatchObject({ anchor: 'orphan' })
    expect(placed[0]).toMatchObject({ anchor: 'moved', place: { line: 1 } })
    expect(performance.now() - started).toBeLessThan(3000)
  })
})
