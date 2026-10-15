import { describe, it, expect } from 'vitest'
import { diffBlocks, diffRounds, roundDiffCounts, roundDiffOf, shownView } from '../../../client/markdown/src/utils/roundDiff.js'
import { parseMarkdownToBlocks } from '../../../client/markdown/src/utils/parser.js'

const diff = (before, after) => diffRounds(parseMarkdownToBlocks(before), parseMarkdownToBlocks(after))
const summary = (entries) => entries.map((e) => [e.change, e.node.block.content])

describe('diffRounds', () => {
  it('keeps every block of an identical document', () => {
    expect(summary(diff('# Plan\n\nOne.\n', '# Plan\n\nOne.\n'))).toEqual([['same', 'Plan'], ['same', 'One.']])
  })

  it('marks a block that is new in this round as added', () => {
    expect(summary(diff('# Plan\n\nOne.\n', '# Plan\n\nOne.\n\nTwo.\n'))).toEqual([['same', 'Plan'], ['same', 'One.'], ['added', 'Two.']])
  })

  it('shows a block that is gone as removed, in the place it had', () => {
    expect(summary(diff('# Plan\n\nOne.\n\nTwo.\n', '# Plan\n\nTwo.\n'))).toEqual([['same', 'Plan'], ['removed', 'One.'], ['same', 'Two.']])
  })

  it('pairs a removed block with the added one next to it as changed, keeping the earlier version', () => {
    const entries = diff('# Plan\n\nOne.\n\nEnd.\n', '# Plan\n\nOne, revised.\n\nEnd.\n')
    expect(summary(entries)).toEqual([['same', 'Plan'], ['changed', 'One, revised.'], ['same', 'End.']])
    expect(entries[1].before.block.content).toBe('One.')
  })

  it('pairs only blocks of the same type that share enough words, and keeps the rest removed or added', () => {
    const entries = diff('A start.\n\nThe plan step.\n\nZ end.\n', 'A start.\n\nSomething new.\n\nThe plan step revised.\n\nZ end.\n')
    expect(summary(entries)).toEqual([['same', 'A start.'], ['added', 'Something new.'], ['changed', 'The plan step revised.'], ['same', 'Z end.']])
    expect(entries[2].before.block.content).toBe('The plan step.')
  })

  it('pairs a run in order and leaves the rest of the longer side', () => {
    const entries = diff('Alpha one.\n\nBeta two.\n\nGamma three.\n\nZ end.\n', 'Alpha one again.\n\nZ end.\n')
    expect(summary(entries)).toEqual([['changed', 'Alpha one again.'], ['removed', 'Beta two.'], ['removed', 'Gamma three.'], ['same', 'Z end.']])
  })

  it('keeps an unrelated rewrite as removed and added, the removed one first', () => {
    expect(summary(diff('Old words here.\n', 'Entirely different text.\n'))).toEqual([['removed', 'Old words here.'], ['added', 'Entirely different text.']])
  })

  it('shows a moved block as removed where it was and added where it is', () => {
    expect(summary(diff('A.\n\nB.\n\nC.\n', 'B.\n\nC.\n\nA.\n'))).toEqual([['removed', 'A.'], ['same', 'B.'], ['same', 'C.'], ['added', 'A.']])
  })

  it('never pairs blocks of different types, even with the same text', () => {
    expect(summary(diff('# Plan\n', 'Plan\n'))).toEqual([['removed', 'Plan'], ['added', 'Plan']])
  })

  it('marks everything as added against an empty earlier round', () => {
    expect(summary(diff('', '# Plan\n\nOne.\n'))).toEqual([['added', 'Plan'], ['added', 'One.']])
  })

  it('compares a quote with its nested blocks as one unit', () => {
    const entries = diff('> Note\n> - a\n> - b\n\nEnd.\n', '> Note\n> - a\n> - c\n\nEnd.\n')
    expect(entries.map((e) => [e.change, e.node.kind])).toEqual([['changed', 'quote'], ['same', 'block']])
  })

  it('compares an HTML wrapper with everything inside it as one unit', () => {
    const wrap = (inner) => `<details>\n<summary>More</summary>\n\n${inner}\n\n</details>\n\nEnd.\n`
    const entries = diff(wrap('Inner text stays here.'), wrap('Inner text stays here too.'))
    expect(entries.map((e) => [e.change, e.node.kind, e.node.block.content])).toEqual([['changed', 'wrapper', '<details>'], ['same', 'block', 'End.']])
    expect(summary(diff(wrap('Same.'), wrap('Same.')))).toEqual([['same', '<details>'], ['same', 'End.']])
  })

  it('compares the frontmatter by its entries', () => {
    const entries = diff('---\ntitle: Plan\nstatus: draft\n---\n\nBody.\n', '---\ntitle: Plan\nstatus: final\n---\n\nBody.\n')
    expect(entries.map((e) => [e.change, e.node.block.type])).toEqual([['changed', 'frontmatter'], ['same', 'paragraph']])
  })

  it('gives the earlier blocks their own ids, apart from the current ones', () => {
    const entries = diff('One step.\n', 'One step more.\n')
    expect(entries[0].node.block.id).toBe('block-0')
    expect(entries[0].before.block.id).toBe('earlier-block-0')
  })

  it('compares blocks that carry their own ids, a path and a side, by what they say only', () => {
    const tag = (blocks, prefix, extra) => blocks.map((b) => ({ ...b, id: `${prefix}${b.id}`, path: 'a.md', sortLine: 4, ...extra }))
    const entries = diffBlocks(tag(parseMarkdownToBlocks('# Plan\n\nOne.\n'), 'old:', { side: 'old' }), tag(parseMarkdownToBlocks('# Plan\n\nTwo.\n'), 'read:', {}))
    expect(entries.map((e) => [e.change, e.node.block.id])).toEqual([['same', 'read:block-0'], ['removed', 'old:block-1'], ['added', 'read:block-1']])
  })

  it('keeps a long document with one edit fast and exact by setting the common start and end aside', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `Paragraph number ${i}.`)
    const edited = lines.map((line, i) => (i === 2500 ? 'Paragraph number 2500, revised.' : line))
    const started = performance.now()
    const entries = diff(lines.join('\n\n'), edited.join('\n\n'))
    expect(performance.now() - started).toBeLessThan(1000)
    expect(roundDiffCounts(entries)).toEqual({ added: 0, changed: 1, removed: 0 })
    expect(entries[2500]).toMatchObject({ change: 'changed', node: { block: { content: 'Paragraph number 2500, revised.' } } })
  })

  it('above the size limit treats the differing middle as one removed and added run', () => {
    const before = ['# Doc', ...Array.from({ length: 2000 }, (_, i) => `old line ${i} alpha`), '# End'].join('\n\n')
    const after = ['# Doc', ...Array.from({ length: 2000 }, (_, i) => `fresh text ${i} beta`), '# End'].join('\n\n')
    const started = performance.now()
    const entries = diff(before, after)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(entries).toHaveLength(4002)
    expect(roundDiffCounts(entries)).toEqual({ added: 2000, changed: 0, removed: 2000 })
    expect(summary([entries[0], entries[1], entries[2000], entries[2001], entries[4001]]))
      .toEqual([['same', 'Doc'], ['removed', 'old line 0 alpha'], ['removed', 'old line 1999 alpha'], ['added', 'fresh text 0 beta'], ['same', 'End']])
  })
})

describe('roundDiffCounts', () => {
  it('counts added, changed and removed blocks', () => {
    expect(roundDiffCounts(diff('Alpha one.\n\nBeta two.\n\nC.\n', 'Alpha one again.\n\nC.\n\nD.\n\nE.\n'))).toEqual({ added: 2, changed: 1, removed: 1 })
  })
})

describe('roundDiffOf', () => {
  const file = (content, previousRound, extra = {}) => ({ content, blocks: parseMarkdownToBlocks(content), previousRound, kind: 'document', isPlainText: false, ...extra })

  it('diffs the file against the content of its last round', () => {
    const diffed = roundDiffOf(file('# Plan\n\nStep two.\n', { round: 2, content: '# Plan\n\nStep one.\n' }))
    expect(diffed.round).toBe(2)
    expect(diffed.counts).toEqual({ added: 0, changed: 1, removed: 0 })
    expect(diffed.entries.map((e) => e.change)).toEqual(['same', 'changed'])
  })

  it('has nothing to show without a last round, for plain text, for changes or when no block differs', () => {
    expect(roundDiffOf(null)).toBeNull()
    expect(roundDiffOf(file('One.\n', null))).toBeNull()
    expect(roundDiffOf(file('One.\n', { round: 1, content: 'Two.\n' }, { isPlainText: true }))).toBeNull()
    expect(roundDiffOf(file('One.\n', { round: 1, content: 'Two.\n' }, { kind: 'changes' }))).toBeNull()
    expect(roundDiffOf(file('One.\n', { round: 1, content: 'One.\n\n\n' }))).toBeNull()
  })
})

describe('shownView', () => {
  const diffed = { round: 1 }
  it('shows the changes view only while the file has a last round to compare with', () => {
    expect(shownView('changes', { plainText: false, roundDiff: diffed })).toBe('changes')
    expect(shownView('changes', { plainText: false, roundDiff: null })).toBe('preview')
  })

  it('keeps preview and source as chosen, and plain text always in source', () => {
    expect(shownView('preview', { plainText: false, roundDiff: diffed })).toBe('preview')
    expect(shownView('source', { plainText: false, roundDiff: diffed })).toBe('source')
    expect(shownView('changes', { plainText: true, roundDiff: null })).toBe('source')
  })
})
