import { describe, it, expect } from 'vitest'
import { shortcutGroups } from '../../../client/shared/utils/shortcuts.js'

const titles = (kind) => shortcutGroups(kind).map((group) => group.title)
const labels = (kind, query) => shortcutGroups(kind, query).flatMap((group) => group.items.map((item) => item.label))

describe('shortcutGroups', () => {
  it('lists only the groups of the open mode', () => {
    expect(titles('pdf')).toEqual(['Tools', 'Notes', 'Pages', 'Review'])
    expect(titles('video')).toEqual(['Tools', 'Notes', 'Timeline', 'Review'])
    expect(titles('markdown')).toEqual(['Tools', 'Notes', 'Search', 'Review'])
    expect(titles('image')).toEqual(['Tools', 'Notes', 'View', 'Review'])
  })

  it('leaves out the keys another mode uses', () => {
    expect(labels('image')).not.toContain('Element')
    expect(labels('url')).toContain('Element')
    expect(labels('markdown')).not.toContain('Box')
    expect(labels('markdown')).toContain('Pinpoint')
  })

  it('filters by label or key and drops empty groups', () => {
    expect(labels('pdf', 'page')).toEqual(['Previous, next page', 'First, last page'])
    expect(labels('pdf', 'home')).toEqual(['First, last page'])
    expect(shortcutGroups('pdf', 'nothing like this')).toEqual([])
  })
})
