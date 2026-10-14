import { describe, it, expect } from 'vitest'
import { formatRepliesSection } from '../../../../server/image/common/repliesSection.js'

const agent = (status, text) => ({ author: 'agent', status, text })
const human = (text) => ({ author: 'human', text })
const thread = (annotation, replies, extra = {}) => ({
  handle: 'b7210e44', number: null, origin: { round: 1, number: 2 }, annotation, element: null, replies, ...extra
})
const pin = { type: 'pin', geometry: { x: 50, y: 80 }, text: 'Button colour' }

describe('formatRepliesSection', () => {
  it('is empty without carried threads', () => {
    expect(formatRepliesSection([], { round: 1, kind: 'file', width: 100, height: 100 })).toBe('')
  })

  it('prints the exchange of a still-image thread with its position', () => {
    const text = formatRepliesSection(
      [thread(pin, [agent('question', 'Green or blue?'), human('Green')])],
      { round: 1, kind: 'file', width: 100, height: 100 }
    )
    expect(text).toBe(
      '\n## Replies to round 1\n\n' +
      '### [#b7210e44] Question · Comment pin: bottom (~80% from top, ~50% from left)\n' +
      '> Round 1, mark 2: Button colour\n' +
      'Agent (question): Green or blue?\n' +
      'Reviewer: Green\n'
    )
  })

  it('names the time on a video and the page in a PDF', () => {
    const video = formatRepliesSection([thread({ ...pin, time: 1.5 }, [human('x')])], { round: 2, kind: 'video' })
    expect(video).toContain('### [#b7210e44] Question · Comment pin: at 00:01.500\n')
    const doc = formatRepliesSection([thread({ ...pin, page: 3 }, [human('x')])], { round: 2, kind: 'document' })
    expect(doc).toContain('### [#b7210e44] Question · Comment pin: page 3\n')
  })

  it('adds the element line when the mark was matched to a page element', () => {
    const text = formatRepliesSection(
      [thread(pin, [human('x')], { element: 'button "Buy" · #buy' })],
      { round: 1, kind: 'url', width: 100, height: 100 }
    )
    expect(text).toContain('Element: button "Buy" · #buy\n')
  })




  it('labels a general comment without a location', () => {
    const text = formatRepliesSection([thread({ type: 'comment', geometry: null, text: 'Overall' }, [human('ok')])], { round: 1, kind: 'file', width: 1, height: 1 })
    expect(text).toContain('### [#b7210e44] General comment\n')
  })

  it('names the intent the reviewer gave the mark and quotes an unnumbered general comment as such', () => {
    const box = { type: 'box', geometry: { x: 0, y: 0, width: 10, height: 10 }, text: 'Drop it', intent: 'remove' }
    const text = formatRepliesSection([
      thread(box, [human('x')]),
      thread({ type: 'comment', geometry: null, text: 'Overall' }, [human('ok')], { origin: { round: 1, number: null } })
    ], { round: 1, kind: 'file', width: 100, height: 100 })
    expect(text).toContain('### [#b7210e44] Remove · Boxed area: top left')
    expect(text).toContain('> Round 1, general comment: Overall\n')
  })

  it('names the intent of a comment on a page', () => {
    const text = formatRepliesSection([thread({ type: 'comment', geometry: null, page: 2, text: 'Dense', intent: 'question' }, [human('x')])], { round: 1, kind: 'document' })
    expect(text).toContain('### [#b7210e44] Question · Comment: page 2\n')
  })
})
