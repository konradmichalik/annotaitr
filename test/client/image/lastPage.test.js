import { describe, it, expect } from 'vitest'
import { restoredPage, rememberedValue } from '../../../client/image/src/document/lastPage.js'

const pages = [{ number: 2 }, { number: 3 }, { number: 5 }]

describe('restoredPage', () => {
  it('returns the page remembered for the same PDF', () => {
    expect(restoredPage(rememberedValue('abc123', 3), 'abc123', pages)).toBe(3)
  })

  it('ignores a page remembered for another PDF', () => {
    expect(restoredPage(rememberedValue('other', 3), 'abc123', pages)).toBeNull()
  })

  it('ignores a page outside the reviewed pages', () => {
    expect(restoredPage(rememberedValue('abc123', 4), 'abc123', pages)).toBeNull()
  })

  it('ignores nothing stored, a missing hash and malformed values', () => {
    expect(restoredPage(null, 'abc123', pages)).toBeNull()
    expect(restoredPage(rememberedValue('abc123', 3), null, pages)).toBeNull()
    expect(restoredPage('abc123:x', 'abc123', pages)).toBeNull()
    expect(restoredPage('abc123', 'abc123', pages)).toBeNull()
  })
})
