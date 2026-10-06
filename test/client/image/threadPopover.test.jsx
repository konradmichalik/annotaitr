import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThreadPopoverContent } from '../../../client/image/src/threads/ThreadPopover.jsx'

const base = {
  number: 2, handle: 'a3f19c2e', anchor: 'exact', reason: null, element: null,
  annotation: { text: 'Make it bigger' }, replies: []
}
const render = (thread) => renderToStaticMarkup(<ThreadPopoverContent thread={thread} round={3} />)

describe('ThreadPopoverContent', () => {
  it('shows the heading, handle, comment and the empty-reply text', () => {
    const html = render(base)
    expect(html).toContain('Round 3')
    expect(html).toContain('#a3f19c2e')
    expect(html).toContain('Make it bigger')
    expect(html).toContain('No reply from the agent yet.')
    expect(html).not.toContain('reply-list')
  })

  it('shows replies, the ghost reason and the element line when present', () => {
    const html = render({
      ...base,
      anchor: 'ghost',
      reason: 'The target changed since round 2',
      element: 'button "Save"',
      replies: [{ status: 'applied', text: 'Done', createdAt: 0 }]
    })
    expect(html).toContain('The target changed since round 2')
    expect(html).toContain('button &quot;Save&quot;')
    expect(html).toContain('status-chip--applied')
    expect(html).not.toContain('No reply from the agent yet.')
  })
})
