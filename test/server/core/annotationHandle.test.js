import { describe, it, expect } from 'vitest'
import { annotationHandle } from '../../../server/core/annotationHandle.js'

describe('annotationHandle', () => {
  it('derives the handle from the first group of a UUID', () => {
    expect(annotationHandle('a3f19c2e-1b4d-4f7a-9c3e-2d5f8a1b6c4d')).toBe('a3f19c2e')
  })

  it('lowercases an uppercase UUID', () => {
    expect(annotationHandle('A3F19C2E-1B4D-4F7A-9C3E-2D5F8A1B6C4D')).toBe('a3f19c2e')
  })

  it('returns null when the id is not UUID-shaped', () => {
    expect(annotationHandle('ann-1')).toBeNull()
  })

  it('returns null when the first group is not 8 hex characters', () => {
    expect(annotationHandle('a3f19c2-1b4d-4f7a-9c3e-2d5f8a1b6c4d')).toBeNull()
    expect(annotationHandle('zzzzzzzz-1b4d-4f7a-9c3e-2d5f8a1b6c4d')).toBeNull()
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
    expect(annotationHandle(42)).toBeNull()
    expect(annotationHandle('')).toBeNull()
  })
})
