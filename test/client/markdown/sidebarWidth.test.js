import { describe, it, expect } from 'vitest'
import { sidebarWidth } from '../../../client/markdown/src/utils/sidebarWidth.js'

const base = { fitted: 420, width: 220, customized: false, viewport: 1500, reserved: 340 }

describe('sidebarWidth', () => {
  it('fits the longest row when there is room', () => {
    expect(sidebarWidth(base)).toBe(420)
  })
  it('never goes below the minimum the CSS enforces', () => {
    expect(sidebarWidth({ ...base, fitted: 100 })).toBe(300)
  })
  it('stops at the maximum', () => {
    expect(sidebarWidth({ ...base, fitted: 900, viewport: 3000 })).toBe(500)
  })
  it('leaves the main area its minimum next to the notes panel', () => {
    expect(sidebarWidth({ ...base, viewport: 1200 })).toBe(300)
    expect(sidebarWidth({ ...base, viewport: 1380 })).toBe(400)
  })
  it('keeps a width the reviewer dragged', () => {
    expect(sidebarWidth({ ...base, customized: true, width: 250 })).toBe(250)
  })
})
