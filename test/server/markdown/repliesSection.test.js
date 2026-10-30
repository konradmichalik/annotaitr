import { describe, it, expect } from 'vitest'
import { formatMarkdownReplies } from '../../../server/markdown/repliesSection.js'

const agent = (status, text) => ({ author: 'agent', status, text })
const human = (text) => ({ author: 'human', text })
const anchor = { quote: 'The intro says hello.', prefix: '', suffix: '', where: 'Line 3', contentHash: 'h1' }
const thread = (handle, annotation, extra = {}) => ({
  handle, number: null, origin: { round: 1, number: 2, where: 'Line 3' }, annotation, element: null,
  file: '/abs/docs/a.md', anchor, replies: [agent('question', 'Shorter or gone?'), human('Shorter')], ...extra
})
const comment = { type: 'COMMENT', intent: 'change', originalText: 'The intro says hello.', text: 'Make it shorter' }

describe('formatMarkdownReplies', () => {
  it('heads a thread with where its text is now and quotes where it was', () => {
    const places = { b7210e44: { anchor: 'moved', place: { path: 'docs/a.md', where: 'Line 9', line: 9 } } }
    expect(formatMarkdownReplies([thread('b7210e44', comment)], 1, { places, kind: 'markdown' })).toBe(
      '\n## Replies to round 1\n\n' +
      '### [#b7210e44] Text (Line 9, docs/a.md)\n' +
      'Selected: `The intro says hello.`\n' +
      '> Round 1, note 2 (Line 3): Make it shorter\n' +
      'Agent (question): Shorter or gone?\n' +
      'Reviewer: Shorter\n'
    )
  })

  it('says when the text is no longer in the document and keeps the original quote', () => {
    const places = { b7210e44: { anchor: 'orphan', place: null } }
    const text = formatMarkdownReplies([thread('b7210e44', comment)], 1, { places, kind: 'markdown' })
    expect(text).toContain('### [#b7210e44] Text (no longer in the document)\nSelected: `The intro says hello.`\n')
  })

  it('leaves out the walkthrough path in a changes review and names the insertion point of an insertion', () => {
    const insertion = { type: 'INSERTION', afterContext: 'const a = 1', text: 'const c = 4' }
    const places = { c1: { anchor: 'exact', place: { path: '.git/annotaitr/changes.md', where: 'new Line 2 in src/a.js', line: 7 } } }
    const text = formatMarkdownReplies([thread('c1', insertion, { anchor: { ...anchor, quote: 'const a = 1' } })], 1, { places, kind: 'changes' })
    expect(text).toContain('### [#c1] Insertion (new Line 2 in src/a.js)\nAfter: `const a = 1`\n')
    const gone = formatMarkdownReplies([thread('c1', insertion)], 1, { places: { c1: { anchor: 'orphan', place: null } }, kind: 'changes' })
    expect(gone).toContain('(no longer in the changes)')
  })

  it('prints a general comment without a place or a quote', () => {
    const general = { type: 'COMMENT', targetType: 'global', text: 'Overall fine' }
    const text = formatMarkdownReplies([thread('d1', general, { anchor: null, origin: { round: 1, number: null } })], 1, { places: {}, kind: 'markdown' })
    expect(text).toContain('### [#d1] General comment\n> Round 1, general comment: Overall fine\n')
  })

  it('fences a selection holding backticks in a longer run of them', () => {
    const ticks = { ...anchor, quote: 'call `run` or ``x``' }
    const text = formatMarkdownReplies([thread('f1', comment, { anchor: ticks })], 1, { places: {}, kind: 'markdown' })
    expect(text).toContain('Selected: ``` call `run` or ``x`` ```\n')
    const edge = formatMarkdownReplies([thread('f2', comment, { anchor: { ...anchor, quote: '`a`' } })], 1, { places: {}, kind: 'markdown' })
    expect(edge).toContain('Selected: `` `a` ``\n')
  })

  it('shortens a long selection to one line', () => {
    const long = { ...anchor, quote: `${'word '.repeat(40)}\nnext line` }
    const text = formatMarkdownReplies([thread('e1', comment, { anchor: long })], 1, { places: { e1: { anchor: 'exact', place: { path: 'a.md', where: 'Line 1' } } }, kind: 'markdown' })
    expect(text).toContain(`Selected: \`${'word '.repeat(23)}word…\`\n`)
  })
})
