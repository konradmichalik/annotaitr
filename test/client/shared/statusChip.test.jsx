import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import StatusChip from '../../../client/shared/components/StatusChip.jsx'
import ReplyList from '../../../client/shared/components/ReplyList.jsx'

const display = { applied: { icon: '✓', label: 'applied' }, none: { icon: '·', label: 'no reply' } }

describe('StatusChip', () => {
  it('shows the icon hidden from assistive tech and the label as text', () => {
    expect(renderToStaticMarkup(<StatusChip status="applied" display={display} />))
      .toBe('<span class="status-chip status-chip--applied"><span aria-hidden="true">✓</span> applied</span>')
  })
})

describe('ReplyList', () => {
  it('lists each reply with its status, text and time', () => {
    const html = renderToStaticMarkup(
      <ReplyList display={display} replies={[{ status: 'applied', text: 'Moved it', createdAt: Date.UTC(2026, 9, 6, 12) }]} />
    )
    expect(html).toContain('<ol class="reply-list">')
    expect(html).toContain('applied</span>')
    expect(html).toContain('Moved it')
    expect(html).toContain('dateTime="2026-10-06T12:00:00.000Z"')
  })

  it('renders a reply with an invalid date without a time element', () => {
    const html = renderToStaticMarkup(
      <ReplyList display={display} replies={[{ id: 'r1', status: 'applied', text: 'Moved it', createdAt: 'nope' }]} />
    )
    expect(html).toContain('Moved it')
    expect(html).not.toContain('<time')
  })
})
