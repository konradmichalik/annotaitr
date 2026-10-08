import { describe, it, expect } from 'vitest'
import { hasDraft } from '../../../client/shared/utils/composerDraft.js'

describe('hasDraft', () => {
  it('is false for an empty new note', () => {
    expect(hasDraft('', '')).toBe(false)
    expect(hasDraft('   \n', '')).toBe(false)
  })

  it('is true once text is typed into a new note', () => {
    expect(hasDraft('Move it up', '')).toBe(true)
  })

  it('is false for an opened note whose text is unchanged', () => {
    expect(hasDraft('Move it up', 'Move it up')).toBe(false)
    expect(hasDraft('Move it up ', 'Move it up')).toBe(false)
  })

  it('is true for an edited or emptied note', () => {
    expect(hasDraft('Move it down', 'Move it up')).toBe(true)
    expect(hasDraft('', 'Move it up')).toBe(true)
  })

  it('counts any other change, such as a new colour, as a draft', () => {
    expect(hasDraft('', '', true)).toBe(true)
  })
})
