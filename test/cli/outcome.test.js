import { describe, it, expect } from 'vitest'
import { composeOutput } from '../../cli/outcome.js'

const carried = [{
  handle: 'b7210e44', number: null, origin: { round: 1, number: 2 }, element: null,
  annotation: { type: 'pin', geometry: { x: 50, y: 80 }, text: 'Button colour' },
  replies: [{ author: 'agent', status: 'question', text: 'Green or blue?' }, { author: 'human', text: 'Green' }]
}]
const opened = { previous: { round: 1 }, target: { kind: 'file' }, imageSize: { width: 100, height: 100 } }
const line = 'Session: 2f8c1a9e04b7 (round 2)\n'
const repliesIndex = (text) => text.indexOf('## Replies to round 1')

describe('composeOutput', () => {
  it('prints the verdict untouched when nothing was carried', () => {
    const decision = { approved: true, output: 'APPROVED: No changes requested.\n', carried: [], replyCount: 0 }
    expect(composeOutput(decision, opened, line)).toBe(`APPROVED: No changes requested.\n${line}`)
  })

  it('builds the replies-only header from the counts frozen at the decision, not from the live store', () => {
    const decision = { approved: true, output: '', repliesOnly: true, carried, replyCount: 1 }
    const live = { ...opened, replies: { count: () => 0, carried: () => [] } }
    const text = composeOutput(decision, live, line)
    expect(text).toMatch(/^APPROVED WITH NOTES: 1 reply to round 1\. The target is approved as-is\./)
    expect(text).toContain('Reviewer: Green')
  })

  it('does not let a late reply change an approval without replies', () => {
    const decision = { approved: true, output: 'APPROVED: No changes requested.\n', carried: [], replyCount: 0 }
    const live = { ...opened, replies: { count: () => 1, carried: () => carried } }
    expect(composeOutput(decision, live, line)).toBe(`APPROVED: No changes requested.\n${line}`)
  })

  it('puts the replies after the new marks of a feedback and the session line last', () => {
    const decision = { approved: false, output: 'Feedback: 1 annotation\n\n[1] Pin: fix the spacing\n', carried, replyCount: 1 }
    const text = composeOutput(decision, opened, line)
    expect(text.startsWith('Feedback: 1 annotation\n')).toBe(true)
    expect(text.indexOf('[1] Pin: fix the spacing')).toBeLessThan(repliesIndex(text))
    expect(repliesIndex(text)).toBeGreaterThan(-1)
    expect(text.endsWith(line)).toBe(true)
  })

  it('keeps the approve-with-notes verdict first, then the marks, then the replies, then the session line', () => {
    const decision = { approved: true, output: 'APPROVED WITH NOTES: 1 note\n\n[1] Pin: tighten\n', carried, replyCount: 1 }
    const text = composeOutput(decision, opened, line)
    expect(text.startsWith('APPROVED WITH NOTES: 1 note\n')).toBe(true)
    expect(text.indexOf('[1] Pin: tighten')).toBeLessThan(repliesIndex(text))
    expect(text.endsWith(line)).toBe(true)
    expect(text.indexOf(line)).toBeGreaterThan(repliesIndex(text))
  })
})
