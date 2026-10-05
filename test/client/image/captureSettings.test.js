import { describe, it, expect } from 'vitest'
import { captureParts, formLabel, formFromCapture, requestFromForm } from '../../../client/image/src/utils/captureSettings.js'

const presets = {
  desktop: { width: 1920, height: 1080 },
  laptop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 }
}
const capture = (viewport, extra = {}) => ({ viewport, delayMs: 0, section: null, presets, ...extra })

describe('formLabel', () => {
  it('names what the form will capture, for the loading screen', () => {
    expect(formLabel({ preset: 'tablet', width: '', height: '' }, presets)).toBe('Tablet 768×1024')
    expect(formLabel({ preset: 'mobile', width: '', height: '' }, presets)).toBe('Phone 375×812')
    expect(formLabel({ preset: 'custom', width: '1000', height: '700' }, presets)).toBe('Custom 1000×700')
    expect(formLabel({ preset: 'tablet', rotated: true, width: '', height: '' }, presets)).toBe('Tablet landscape 1024×768')
  })
})

describe('captureParts', () => {
  it('splits the capture into its preset, its label and its size', () => {
    expect(captureParts(capture(presets.mobile))).toEqual({ preset: 'mobile', rotated: false, label: 'Phone', size: '375×812' })
    expect(captureParts(capture({ width: 1000, height: 700 }))).toEqual({ preset: 'custom', rotated: false, label: 'Custom', size: '1000×700' })
    expect(captureParts(capture({ width: 812, height: 375 }))).toEqual({ preset: 'mobile', rotated: true, label: 'Phone landscape', size: '812×375' })
    expect(captureParts(capture({ width: 1080, height: 1920 })).preset).toBe('custom')
  })
})

describe('formFromCapture', () => {
  it('starts the form from the current capture', () => {
    expect(formFromCapture(capture(presets.tablet, { delayMs: 300, section: { anchor: '#pricing' } }))).toEqual({
      preset: 'tablet', rotated: false, width: '768', height: '1024', delayMs: '300', section: 'anchor', anchor: '#pricing', scrollY: ''
    })
    expect(formFromCapture(capture({ width: 1000, height: 700 }, { section: { scrollY: 1200 } }))).toMatchObject({
      preset: 'custom', width: '1000', height: '700', section: 'scrollY', scrollY: '1200'
    })
  })
})

describe('a rotated capture', () => {
  it('opens the form on the preset, turned', () => {
    expect(formFromCapture(capture({ width: 1024, height: 768 }))).toMatchObject({ preset: 'tablet', rotated: true })
  })
})

describe('requestFromForm', () => {
  const form = { preset: 'tablet', width: '', height: '', delayMs: '', section: 'full', anchor: '', scrollY: '' }

  it('sends a preset by name, an empty delay as 0 and the full page as no section', () => {
    expect(requestFromForm(form)).toEqual({ viewport: 'tablet', delayMs: 0, section: null })
  })

  it('sends a rotated tablet or phone as its swapped size', () => {
    expect(requestFromForm({ ...form, rotated: true }, presets).viewport).toBe('1024x768')
    expect(requestFromForm({ ...form, preset: 'mobile', rotated: true }, presets).viewport).toBe('812x375')
  })

  it('sends a custom size as WxH and a delay as a number', () => {
    expect(requestFromForm({ ...form, preset: 'custom', width: '1000', height: '700', delayMs: '500' }))
      .toEqual({ viewport: '1000x700', delayMs: 500, section: null })
  })

  it('sends the first screen as a section at the top, and reads it back as such', () => {
    expect(requestFromForm({ ...form, section: 'top' }).section).toEqual({ scrollY: 0 })
    expect(formFromCapture(capture(presets.mobile, { section: { scrollY: 0 } })).section).toBe('top')
  })

  it('adds the missing # to an anchor and sends a scroll position as a number', () => {
    expect(requestFromForm({ ...form, section: 'anchor', anchor: 'pricing' }).section).toEqual({ anchor: '#pricing' })
    expect(requestFromForm({ ...form, section: 'anchor', anchor: ' #pricing ' }).section).toEqual({ anchor: '#pricing' })
    expect(requestFromForm({ ...form, section: 'scrollY', scrollY: '1200' }).section).toEqual({ scrollY: 1200 })
  })
})
