import { describe, it, expect } from 'vitest'
import { addReply, REPLY_STATUSES, MAX_REPLY_LENGTH } from '../../../../server/core/session/reply.js'

const thread = (handle, number) => ({ handle, number, annotation: { id: `${handle ?? 'x'}-id` }, element: null, replies: [] })
const session = {
  schemaVersion: 1, sessionId: '2f8c1a9e04b7', round: 1, writtenAt: 1, target: {}, threads: [thread('a3f19c2e', 1), thread(null, 2)]
}
const reply = (extra = {}) => addReply(session, { to: 'a3f19c2e', status: 'applied', text: 'Moved the button', now: 5, id: 'r1', ...extra })

describe('addReply', () => {
  it('appends an agent reply to the thread with that handle', () => {
    const { session: next, thread: answered } = reply()
    expect(answered.replies).toEqual([{ id: 'r1', author: 'agent', status: 'applied', text: 'Moved the button', createdAt: 5 }])
    expect(next.threads[1]).toBe(session.threads[1])
  })

  it('leaves the given session untouched', () => {
    reply()
    expect(session.threads[0].replies).toEqual([])
  })

  it('accepts the handle as quoted in the feedback, with # and in any case', () => {
    expect(reply({ to: '#A3F19C2E' }).thread.handle).toBe('a3f19c2e')
  })

  it('keeps earlier replies, the last one carries the status', () => {
    const first = reply()
    const second = addReply(first.session, { to: 'a3f19c2e', status: 'partial', text: 'Colour still open', now: 6, id: 'r2' })
    expect(second.thread.replies.map((r) => r.status)).toEqual(['applied', 'partial'])
  })

  it('rejects an unknown handle and names the known ones', () => {
    expect(reply({ to: 'deadbeef' }).error).toMatch(/No mark #deadbeef .*Known: #a3f19c2e/)
  })

  it('rejects a status outside the closed set', () => {
    expect(REPLY_STATUSES).toEqual(['applied', 'partial', 'declined', 'deferred', 'question'])
    expect(reply({ status: 'done' }).error).toMatch(/Unknown status "done"/)
  })

  it('requires text for every status', () => {
    for (const status of REPLY_STATUSES) {
      expect(reply({ status, text: '   ' }).error).toMatch(/needs --text/)
    }
  })

  it('rejects text over the limit', () => {
    expect(reply({ text: 'x'.repeat(MAX_REPLY_LENGTH + 1) }).error).toMatch(/longer than 4000/)
    expect(reply({ text: 'x'.repeat(MAX_REPLY_LENGTH) }).error).toBeUndefined()
  })
})
