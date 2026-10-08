import { describe, it, expect } from 'vitest'
import { isGeneralComment } from '../../../client/markdown/src/hooks/useReviewDecision.js'

describe('isGeneralComment', () => {
  it('matches the reviewer general comment', () => {
    expect(isGeneralComment({ type: 'COMMENT', targetType: 'global' })).toBe(true)
  })

  it('does not take an agent note without a line for the general comment', () => {
    expect(isGeneralComment({ type: 'NOTES', targetType: 'global' })).toBe(false)
  })
})
