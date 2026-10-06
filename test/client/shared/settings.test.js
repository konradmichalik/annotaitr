import { describe, it, expect } from 'vitest'
import { mergeSettings, sharedPart, SHARED_DEFAULTS } from '../../../client/shared/hooks/useSettings.js'

describe('mergeSettings', () => {
  const defaults = { ...SHARED_DEFAULTS, fontSize: 15 }

  it('falls back to the defaults when nothing is stored', () => {
    expect(mergeSettings(defaults, null, null)).toEqual(defaults)
  })

  it('lets the shared cookie win over a mode cookie for shared keys', () => {
    const mode = JSON.stringify({ theme: 'light', fontSize: 17 })
    const shared = JSON.stringify({ theme: 'dark' })
    expect(mergeSettings(defaults, mode, shared)).toEqual({ ...defaults, theme: 'dark', fontSize: 17 })
  })

  it('ignores mode-specific keys in the shared cookie', () => {
    const shared = JSON.stringify({ theme: 'dark', fontSize: 20 })
    expect(mergeSettings(defaults, null, shared).fontSize).toBe(15)
  })

  it('ignores a cookie that is not valid JSON', () => {
    expect(mergeSettings(defaults, '{broken', 'also broken')).toEqual(defaults)
  })
})

describe('sharedPart', () => {
  it('keeps only the keys both modes share', () => {
    expect(sharedPart({ theme: 'dark', autoCloseDelay: '3', fontSize: 17 })).toEqual({ theme: 'dark', autoCloseDelay: '3' })
  })
})
