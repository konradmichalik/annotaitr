import { describe, it, expect } from 'vitest'
import { feedbackMarkdown } from '../../../client/image/src/utils/feedbackMarkdown.js'

describe('feedbackMarkdown', () => {
  const annotations = [
    { id: 'g', type: 'comment', geometry: null, text: 'Overall fine' },
    { id: 'b', type: 'pin', number: 2, intent: 'question', geometry: { x: 1, y: 1 }, text: 'Why?', page: 2 },
    { id: 'a', type: 'box', number: 1, intent: 'change', geometry: { x: 0, y: 0, width: 5, height: 5 }, text: '' }
  ]

  it('lists numbered notes by number, then the general comment', () => {
    const locate = (a) => (typeof a.page === 'number' ? `Page ${a.page}` : null)
    expect(feedbackMarkdown(annotations, { target: 'plan.pdf', locate })).toBe([
      '# Feedback on plan.pdf',
      '',
      '1. **Change** (Box): (no comment)',
      '2. **Question** (Pin, Page 2): Why?',
      '- **General**: Overall fine',
      ''
    ].join('\n'))
  })
})
