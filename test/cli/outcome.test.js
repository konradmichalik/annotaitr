import { describe, it, expect } from 'vitest'
import { composeOutput } from '../../cli/outcome.js'
import { exportFeedback } from '../../server/image/common/feedback.js'

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

  it('prints round 2 with stable numbers and intents, and the round 1 thread from a session saved before intents', () => {
    const box = { id: 'a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d', type: 'box', number: 1, intent: 'change', text: 'Wider', geometry: { x: 0, y: 0, width: 20, height: 20 } }
    const decision = { approved: false, output: exportFeedback([box], 100, 100, '/tmp/a.png'), carried, replyCount: 1 }
    const text = composeOutput(decision, opened, line)
    expect(text).toMatch(/^1 annotation \(1 Change\) on the screenshot\./)
    expect(text).toContain('### 1. [#a3f19c2e] Change · Boxed area: top left')
    expect(text).toContain('### [#b7210e44] Question · Comment pin: bottom')
    expect(text).toContain('> Round 1, mark 2: Button colour')
    expect(text.indexOf('### 1. [#a3f19c2e]')).toBeLessThan(repliesIndex(text))
  })
})
