import { describe, it, expect } from 'vitest'
import { diffRounds, roundDiffCounts } from '../../../client/markdown/src/utils/roundDiff.js'
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

  it('pairs a run in order and leaves the rest of the longer side', () => {
    const entries = diff('A.\n\nB.\n\nC.\n\nZ.\n', 'A2.\n\nZ.\n')
    expect(summary(entries)).toEqual([['changed', 'A2.'], ['removed', 'B.'], ['removed', 'C.'], ['same', 'Z.']])
  })

  it('shows a moved block as removed where it was and added where it is', () => {
    expect(summary(diff('A.\n\nB.\n\nC.\n', 'B.\n\nC.\n\nA.\n'))).toEqual([['removed', 'A.'], ['same', 'B.'], ['same', 'C.'], ['added', 'A.']])
  })

  it('compares the type as well as the text', () => {
    expect(summary(diff('# Plan\n', 'Plan\n'))).toEqual([['changed', 'Plan']])
  })

  it('marks everything as added against an empty earlier round', () => {
    expect(summary(diff('', '# Plan\n\nOne.\n'))).toEqual([['added', 'Plan'], ['added', 'One.']])
  })

  it('compares a quote with its nested blocks as one unit', () => {
    const entries = diff('> Note\n> - a\n> - b\n\nEnd.\n', '> Note\n> - a\n> - c\n\nEnd.\n')
    expect(entries.map((e) => [e.change, e.node.kind])).toEqual([['changed', 'quote'], ['same', 'block']])
  })

  it('gives the earlier blocks their own ids, apart from the current ones', () => {
    const entries = diff('One.\n', 'Two.\n')
    expect(entries[0].node.block.id).toBe('block-0')
    expect(entries[0].before.block.id).toBe('earlier-block-0')
  })
})

describe('roundDiffCounts', () => {
  it('counts added, changed and removed blocks', () => {
    expect(roundDiffCounts(diff('A.\n\nB.\n\nC.\n', 'A2.\n\nC.\n\nD.\n\nE.\n'))).toEqual({ added: 2, changed: 1, removed: 1 })
  })
})
