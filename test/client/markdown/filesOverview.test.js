import { describe, it, expect } from 'vitest'
import { filesOverview } from '../../../client/markdown/src/utils/filesOverview.js'

const file = (path, { opened = false, reviewed = false, annotations = [] } = {}) => ({ path, opened, reviewed, annState: { annotations } })
const note = (id, extra = {}) => ({ id, type: 'COMMENT', blockId: 'b', number: 1, ...extra })

describe('filesOverview', () => {
  it('lists every file with its short name, note count and state', () => {
    const { rows } = filesOverview([
      file('../../x/README.md', { opened: true, annotations: [note('a'), note('b')] }),
      file('../../x/docs/usage.md', { opened: true, reviewed: true }),
      file('../../x/docs/release.md')
    ])
    expect(rows.map(({ name, count, state }) => [name, count, state])).toEqual([
      ['README.md', 2, 'opened'],
      ['usage.md', 0, 'reviewed'],
      ['release.md', 0, 'not-opened']
    ])
  })

  it('counts the reviewer\'s notes only: no agent notes, no general comment', () => {
    const { rows } = filesOverview([file('a.md', {
      annotations: [note('a'), note('n', { type: 'NOTES' }), note('g', { targetType: 'global', number: undefined })]
    })])
    expect(rows[0].count).toBe(1)
  })

  it('says how many files are reviewed', () => {
    const overview = filesOverview([file('a.md', { reviewed: true }), file('b.md'), file('c.md', { reviewed: true })])
    expect(overview.reviewed).toBe(2)
    expect(overview.total).toBe(3)
    expect(overview.summary).toBe('2 of 3 reviewed')
  })
})
