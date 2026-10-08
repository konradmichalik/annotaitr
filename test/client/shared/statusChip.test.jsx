import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import StatusChip from '../../../client/shared/components/StatusChip.jsx'
import ReplyList from '../../../client/shared/components/ReplyList.jsx'

const display = { applied: { icon: '✓', label: 'applied' }, none: { icon: '·', label: 'no reply' } }

describe('StatusChip', () => {
  it('shows the icon hidden from assistive tech and the label as text', () => {
    expect(renderToStaticMarkup(<StatusChip status="applied" display={display} />))
      .toBe('<span class="status-chip status-chip--applied"><span aria-hidden="true">✓</span> <span class="status-chip-label">applied</span></span>')
  })
})

describe('ReplyList', () => {
  it('lists each reply with its status, text and time', () => {
    const html = renderToStaticMarkup(
      <ReplyList display={display} replies={[{ status: 'applied', text: 'Moved it', createdAt: Date.UTC(2026, 9, 6, 12) }]} />
    )
    expect(html).toContain('<ol class="reply-list">')
    expect(html).toContain('applied</span>')
    expect(html).not.toContain('reply-list-avatar')
    expect(html).toContain('Moved it')
    expect(html).toContain('dateTime="2026-10-06T12:00:00.000Z"')
  })

  it('labels each reply by its author through the labels prop', () => {
    const labels = { agent: 'Agent', human: 'You' }
    const html = renderToStaticMarkup(
      <ReplyList display={display} labels={labels} replies={[
        { status: 'applied', text: 'Done', author: 'agent', createdAt: 0 },
        { status: 'applied', text: 'Thanks', author: 'human', createdAt: 0 }
      ]} />
    )
    expect(html).toContain('reply-list-author">Agent<')
    expect(html).toContain('reply-list-author">You<')
  })

  it('treats a reply without an author as the agent', () => {
    const html = renderToStaticMarkup(
      <ReplyList display={display} labels={{ agent: 'Agent', human: 'You' }} replies={[{ status: 'applied', text: 'Done', createdAt: 0 }]} />
    )
    expect(html).toContain('reply-list-author">Agent<')
  })

  it('renders a reply with an invalid date without a time element', () => {
    const html = renderToStaticMarkup(
      <ReplyList display={display} replies={[{ id: 'r1', status: 'applied', text: 'Moved it', createdAt: 'nope' }]} />
    )
    expect(html).toContain('Moved it')
    expect(html).not.toContain('<time')
  })

  it('shows no status chip for a reviewer reply and marks a pending one', () => {
    const html = renderToStaticMarkup(
      <ReplyList display={display} labels={{ human: 'You' }} pendingLabel="pending, sent with your decision"
        replies={[{ id: 'h1', author: 'human', text: 'Green', createdAt: 1, pending: true }]} onRemove={() => {}} />
    )
    expect(html).not.toContain('status-chip')
    expect(html).toContain('pending, sent with your decision')
    expect(html).toContain('<button type="button"')
    expect(html).toContain('Remove')
  })

  it('gives each author its avatar and shows a message detail after the name', () => {
    const html = renderToStaticMarkup(
      <ReplyList display={display} labels={{ human: 'You' }} avatars={{ human: 'You', agent: 'AI' }}
        replies={[{ author: 'human', text: 'Bigger', meta: 'round 1' }, { status: 'applied', text: 'Done', createdAt: 0 }]} />
    )
    expect(html).toContain('<span class="reply-list-avatar" aria-hidden="true">You</span>')
    expect(html).toContain('<span class="reply-list-avatar" aria-hidden="true">AI</span>')
    expect(html).toContain('· round 1')
  })

  it('sets a pending reply apart', () => {
    const html = renderToStaticMarkup(
      <ReplyList display={display} pendingLabel="Pending, sent with your decision" replies={[{ id: 'h1', author: 'human', text: 'Green', pending: true }]} />
    )
    expect(html).toContain('reply-list-item--pending')
  })
})
