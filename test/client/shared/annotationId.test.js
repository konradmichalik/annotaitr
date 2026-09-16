import { describe, it, expect, afterEach, vi } from 'vitest'
import { createAnnotationId, annotationHandle } from '../../../client/shared/utils/annotationId.js'

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('createAnnotationId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a v4 UUID', () => {
    expect(createAnnotationId()).toMatch(UUID_SHAPE)
  })

  it('falls back to a manual v4 UUID outside a secure context', () => {
    vi.stubGlobal('crypto', {})
    expect(createAnnotationId()).toMatch(UUID_SHAPE)
  })

  it('never produces two equal ids across many calls, in either path', () => {
    const ids = new Set()
    for (let i = 0; i < 200; i++) { ids.add(createAnnotationId()) }
    vi.stubGlobal('crypto', {})
    for (let i = 0; i < 200; i++) { ids.add(createAnnotationId()) }
    expect(ids.size).toBe(400)
  })

  it('produces ids that always yield a handle', () => {
    expect(annotationHandle(createAnnotationId())).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('annotationHandle', () => {
  it('derives the handle from the first group of a UUID', () => {
    expect(annotationHandle('a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d')).toBe('a3f19c2e')
  })

  it('lowercases an uppercase UUID', () => {
    expect(annotationHandle('A3F19C2E-1B4D-4F7A-9C3E-2D5F8A1B6C4D')).toBe('a3f19c2e')
  })

  it('returns null when the id is not UUID-shaped', () => {
    expect(annotationHandle('ann-1')).toBeNull()
    expect(annotationHandle('a3f19c2-1b4d-4f7a-9c3e-2d5f8a1b6c4d')).toBeNull()
  })

  it('returns null when only the first group is UUID-shaped, so prefix twins cannot collide', () => {
    expect(annotationHandle('a3f19c2e-not-a-uuid')).toBeNull()
    expect(annotationHandle('a3f19c2e')).toBeNull()
    expect(annotationHandle('a3f19c2e-1b4d-4f7a-9c3e')).toBeNull()
    expect(annotationHandle('a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d-extra')).toBeNull()
  })

  it('returns null for a missing or non-string id', () => {
    expect(annotationHandle(undefined)).toBeNull()
    expect(annotationHandle(null)).toBeNull()
    expect(annotationHandle('')).toBeNull()
  })
})
