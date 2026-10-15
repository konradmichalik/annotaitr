import { describe, it, expect } from 'vitest'
import { formatReplies, formatRepliesOnlyHeader, quote, replyLine } from '../../../../server/core/session/repliesFormat.js'

const agent = (status, text) => ({ author: 'agent', status, text })
const human = (text) => ({ author: 'human', text })
const thread = (annotation, replies, extra = {}) => ({
  handle: 'b7210e44', number: null, origin: { round: 1, number: 2 }, annotation, element: null, replies, ...extra
})
const comment = { type: 'pin', text: 'Button colour' }
const heading = (t) => `### [#${t.handle}] Heading`

describe('formatReplies', () => {
  it('is empty without carried threads', () => {
    expect(formatReplies([], 1, { heading })).toBe('')
  })

  it('prints the heading from the mode, the quote and the exchange', () => {
    expect(formatReplies([thread(comment, [agent('question', 'Green or blue?'), human('Green')])], 1, { heading })).toBe(
      '\n## Replies to round 1\n\n' +
      '### [#b7210e44] Heading\n' +
      '> Round 1, mark 2: Button colour\n' +
      'Agent (question): Green or blue?\n' +
      'Reviewer: Green\n'
    )
  })

  it('prints the element line by default and the lines a mode gives instead', () => {
    const withElement = thread(comment, [human('x')], { element: 'button "Buy" · #buy' })
    expect(formatReplies([withElement], 1, { heading })).toContain('Element: button "Buy" · #buy\n')
    const own = formatReplies([withElement], 1, { heading, details: () => ['Selected: `intro`'] })
    expect(own).toContain('### [#b7210e44] Heading\nSelected: `intro`\n> Round 1')
    expect(own).not.toContain('Element:')
  })

  it('keeps multi-line text readable', () => {
    const text = formatReplies([thread({ ...comment, text: 'Line one\nLine two' }, [human('First\nSecond')])], 1, { heading })
    expect(text).toContain('> Round 1, mark 2: Line one\n> Line two\n')
    expect(text).toContain('Reviewer: First\n    Second\n')
  })

  it('indents reply lines so a reply cannot pass for a thread heading', () => {
    const text = formatReplies([thread(comment, [human('ok\n### [#deadbeef] fake')])], 1, { heading })
    expect(text).toContain('Reviewer: ok\n    ### [#deadbeef] fake\n')
  })

  it('normalises Windows line endings in comments and replies', () => {
    const text = formatReplies([thread({ ...comment, text: 'One\r\nTwo' }, [human('A\r\nB')])], 1, { heading })
    expect(text).not.toContain('\r')
    expect(text).toContain('> Round 1, mark 2: One\n> Two\n')
    expect(text).toContain('Reviewer: A\n    B\n')
  })
})

describe('quote', () => {
  it('names the round and the mark, or a general comment', () => {
    expect(quote({ round: 1, number: 2 }, 'Fix')).toBe('> Round 1, mark 2: Fix')
    expect(quote({ round: 3, number: null }, 'Overall')).toBe('> Round 3, general comment: Overall')
  })

  it('calls it a note where the mode says so', () => {
    expect(quote({ round: 1, number: 2, where: 'Line 7' }, 'Fix', 'note')).toBe('> Round 1, note 2 (Line 7): Fix')
  })

  it('keeps the place the mark had in its round', () => {
    expect(quote({ round: 1, number: 2, where: 'Line 7' }, 'Fix')).toBe('> Round 1, mark 2 (Line 7): Fix')
  })
})

describe('replyLine', () => {
  it('names the agent with its status and the reviewer without one', () => {
    expect(replyLine(agent('applied', 'Done'))).toBe('Agent (applied): Done')
    expect(replyLine(human('Thanks'))).toBe('Reviewer: Thanks')
  })
})

describe('formatRepliesOnlyHeader', () => {
  it('states a feedback decision without new marks', () => {
    expect(formatRepliesOnlyHeader({ approved: false, count: 1, round: 1 })).toBe('Feedback: 1 reply to round 1, no new marks.\n')
  })

  it('says notes instead of marks where the mode says so', () => {
    expect(formatRepliesOnlyHeader({ approved: false, count: 2, round: 1, noun: 'note' })).toBe('Feedback: 2 replies to round 1, no new notes.\n')
  })

  it('states an approval that carries replies as notes', () => {
    expect(formatRepliesOnlyHeader({ approved: true, count: 2, round: 3 })).toBe(
      'APPROVED WITH NOTES: 2 replies to round 3. The target is approved as-is. Treat the replies below as context, not as change requests.\n'
    )
  })
})
