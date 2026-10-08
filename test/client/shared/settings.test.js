import { describe, it, expect } from 'vitest'
import { mergeSettings, migrateSettings, sharedPart, SHARED_DEFAULTS } from '../../../client/shared/utils/settings.js'

describe('mergeSettings', () => {
  const defaults = { ...SHARED_DEFAULTS, fontSize: 15, keepDrafts: true }

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

  it('carries an old auto-save choice over to Keep drafts', () => {
    const mode = JSON.stringify({ autoSaveDrafts: false })
    const merged = mergeSettings(defaults, mode, null)
    expect(merged.keepDrafts).toBe(false)
    expect(merged).not.toHaveProperty('autoSaveDrafts')
  })

  it('takes the delay of the first auto-close cookie while nothing newer holds one', () => {
    expect(mergeSettings(defaults, null, null, '5').autoCloseDelay).toBe('5')
    expect(mergeSettings(defaults, JSON.stringify({ autoCloseDelay: '3' }), null, '5').autoCloseDelay).toBe('3')
    expect(mergeSettings(defaults, null, JSON.stringify({ autoCloseDelay: 'off' }), '5').autoCloseDelay).toBe('off')
  })

  it('keeps an existing delay and theme so stored settings stay compatible', () => {
    const shared = JSON.stringify({ theme: 'auto', autoCloseDelay: '0' })
    expect(mergeSettings(defaults, null, shared)).toMatchObject({ theme: 'auto', autoCloseDelay: '0' })
  })
})

describe('migrateSettings', () => {
  it('prefers keepDrafts when both names are stored', () => {
    expect(migrateSettings({ autoSaveDrafts: false, keepDrafts: true })).toEqual({ keepDrafts: true })
  })

  it('turns an old numeric or false delay into the string the dialog uses', () => {
    expect(migrateSettings({ autoCloseDelay: 3 }).autoCloseDelay).toBe('3')
    expect(migrateSettings({ autoCloseDelay: false }).autoCloseDelay).toBe('off')
  })

  it('drops values no control offers, so their defaults apply', () => {
    expect(migrateSettings({ autoCloseDelay: '10', theme: 'sepia', defaultIntent: 'praise', fontSize: 17 })).toEqual({ fontSize: 17 })
  })

  it('leaves the stored object untouched', () => {
    const stored = { autoSaveDrafts: true }
    migrateSettings(stored)
    expect(stored).toEqual({ autoSaveDrafts: true })
  })
})

describe('sharedPart', () => {
  it('keeps only the keys both modes share', () => {
    expect(sharedPart({ theme: 'dark', autoCloseDelay: '3', toolHints: false, defaultIntent: 'add', fontSize: 17 }))
      .toEqual({ theme: 'dark', autoCloseDelay: '3', toolHints: false, defaultIntent: 'add' })
  })
})
