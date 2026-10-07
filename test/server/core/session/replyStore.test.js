import { describe, it, expect } from 'vitest'
import { createReplyStore } from '../../../../server/core/session/replyStore.js'

const agent = { id: 'r1', author: 'agent', status: 'question', text: 'Green or blue?', createdAt: 1 }
const previous = {
  round: 1,
  threads: [
    { handle: 'a3f19c2e', number: 1, annotation: { type: 'pin' }, element: null, replies: [agent] },
    { handle: 'b7210e44', number: 2, annotation: { type: 'pin' }, element: null, replies: [agent] }
  ]
}

describe('createReplyStore', () => {
  it('keeps a reviewer reply pending for a thread of the last round', () => {
    const store = createReplyStore(previous)
    const { reply } = store.add('b7210e44', '  Green  ', { now: 5, id: 'h1' })
    expect(reply).toEqual({ id: 'h1', author: 'human', text: 'Green', createdAt: 5 })
    expect(store.pending('b7210e44')).toEqual([reply])
    expect(store.count()).toBe(1)
  })

  it('accepts the handle as quoted, with # and in any case', () => {
    expect(createReplyStore(previous).add('#B7210E44', 'Green').reply).toBeTruthy()
  })

  it('rejects an unknown handle with 404 and invalid text with 400', () => {
    const store = createReplyStore(previous)
    expect(store.add('deadbeef', 'x')).toEqual({ error: 'No thread #deadbeef in round 1', status: 404 })
    expect(store.add('b7210e44', '   ')).toEqual({ error: 'A reply needs text', status: 400 })
    expect(store.add('b7210e44', 'x'.repeat(4001))).toEqual({ error: 'Reply text is longer than 4000 characters', status: 400 })
    expect(store.count()).toBe(0)
  })

  it('has nothing to reply to without a previous round', () => {
    expect(createReplyStore(null).add('b7210e44', 'x').status).toBe(404)
  })

  it('removes a pending reply so it is not carried', () => {
    const store = createReplyStore(previous)
    store.add('b7210e44', 'Green', { id: 'h1' })
    expect(store.remove('b7210e44', 'h1')).toBe(true)
    expect(store.remove('b7210e44', 'h1')).toBe(false)
    expect(store.carried()).toEqual([])
  })

  it('carries only replied threads, with the whole chain, no number and the origin', () => {
    const store = createReplyStore(previous)
    store.add('b7210e44', 'Green', { now: 5, id: 'h1' })
    store.add('b7210e44', 'The dark one', { now: 6, id: 'h2' })
    expect(store.carried()).toEqual([{
      handle: 'b7210e44',
      number: null,
      origin: { round: 1, number: 2 },
      annotation: { type: 'pin' },
      element: null,
      replies: [agent, { id: 'h1', author: 'human', text: 'Green', createdAt: 5 }, { id: 'h2', author: 'human', text: 'The dark one', createdAt: 6 }]
    }])
  })

  it('carries the origin from previous carried threads', () => {
    const carriedBefore = { round: 2, threads: [{ handle: 'b7210e44', number: null, origin: { round: 1, number: 2 }, annotation: {}, element: null, replies: [agent] }] }
    const store = createReplyStore(carriedBefore)
    store.add('b7210e44', 'Still green', { id: 'h3', now: 9 })
    expect(store.carried()[0].origin).toEqual({ round: 1, number: 2 })
    expect(store.carried()[0].replies.map((r) => r.id)).toEqual(['r1', 'h3'])
  })
})
