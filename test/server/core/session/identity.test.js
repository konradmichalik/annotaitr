import { describe, it, expect } from 'vitest'
import { isSessionId, sessionIdFor, newSessionId, urlIdentity } from '../../../../server/core/session/identity.js'

describe('session identity', () => {
  it('derives a stable 12-hex id from a target identity', () => {
    const id = sessionIdFor('/tmp/shot.png')
    expect(id).toMatch(/^[0-9a-f]{12}$/)
    expect(sessionIdFor('/tmp/shot.png')).toBe(id)
    expect(sessionIdFor('/tmp/other.png')).not.toBe(id)
  })

  it('creates random ids of the same shape', () => {
    const a = newSessionId()
    expect(isSessionId(a)).toBe(true)
    expect(newSessionId()).not.toBe(a)
  })

  it('accepts only 12 lowercase hex characters, so an id can never name a path', () => {
    expect(isSessionId('2f8c1a9e04b7')).toBe(true)
    for (const bad of ['../../etc/x', '2F8C1A9E04B7', '2f8c1a', '2f8c1a9e04b7a', '', null, 42]) {
      expect(isSessionId(bad)).toBe(false)
    }
  })

  it('normalises a URL so trivially different spellings share a session', () => {
    expect(urlIdentity('HTTP://Example.com')).toBe('http://example.com/')
    expect(urlIdentity('http://example.com/a?b=1')).toBe('http://example.com/a?b=1')
  })
})
