import { describe, it, expect } from 'vitest'
import { config, parseViewportSpec, VIEWPORT_PRESETS, parseDelay, parseCaptureSettings, describeCapture } from '../../../server/image/config.js'

describe('image config', () => {
  it('has expected shape', () => {
    expect(config).toHaveProperty('captureTimeoutMs')
    expect(config).toHaveProperty('maxImageBytes')
    expect(config).toHaveProperty('maxImageDimension')
  })
})

describe('parseViewportSpec', () => {
  it('defaults to desktop when no spec is given', () => {
    expect(parseViewportSpec(null)).toEqual(VIEWPORT_PRESETS.desktop)
  })

  it('resolves known presets case-insensitively', () => {
    expect(parseViewportSpec('mobile')).toEqual(VIEWPORT_PRESETS.mobile)
    expect(parseViewportSpec('MOBILE')).toEqual(VIEWPORT_PRESETS.mobile)
  })

  it('parses an explicit WxH', () => {
    expect(parseViewportSpec('1024x768')).toEqual({ width: 1024, height: 768 })
  })

  it('returns null for an unrecognized spec', () => {
    expect(parseViewportSpec('ultrawide')).toBeNull()
    expect(parseViewportSpec('0x0')).toBeNull()
  })
})

describe('parseDelay', () => {
  it('accepts whole milliseconds from 0 to 10000', () => {
    expect(parseDelay('0')).toBe(0)
    expect(parseDelay('500')).toBe(500)
    expect(parseDelay(10000)).toBe(10000)
  })

  it('rejects anything else', () => {
    for (const value of ['-1', '10001', '1.5', 'soon', '', null, undefined, Number.NaN]) {
      expect(parseDelay(value)).toBeNull()
    }
  })
})

describe('parseCaptureSettings', () => {
  it('reads a preset or WxH viewport, a delay and a section', () => {
    expect(parseCaptureSettings({ viewport: 'tablet', delayMs: 500, section: { anchor: '#pricing' } })).toEqual({
      settings: { viewport: VIEWPORT_PRESETS.tablet, delayMs: 500, section: { anchor: '#pricing' } }
    })
    expect(parseCaptureSettings({ viewport: '1024x768', section: { scrollY: 1200 } })).toEqual({
      settings: { viewport: { width: 1024, height: 768 }, delayMs: 0, section: { scrollY: 1200 } }
    })
    expect(parseCaptureSettings({ viewport: 'mobile' })).toEqual({
      settings: { viewport: VIEWPORT_PRESETS.mobile, delayMs: 0, section: null }
    })
  })

  it('rejects an unknown, tiny or oversized viewport', () => {
    for (const viewport of ['ultrawide', '10x10', '5000x800', 42, undefined]) {
      expect(parseCaptureSettings({ viewport }).error).toMatch(/viewport/i)
    }
  })

  it('rejects an out-of-range delay', () => {
    expect(parseCaptureSettings({ viewport: 'mobile', delayMs: 20000 }).error).toMatch(/delay/i)
  })

  it('accepts only a plain #identifier anchor or a whole, non-negative scroll position', () => {
    for (const section of [{ anchor: 'pricing' }, { anchor: '#a b' }, { anchor: '#x"]' }, { scrollY: -5 }, { scrollY: 1.5 }, { scrollY: 30000 }, { other: 1 }, 'top']) {
      expect(parseCaptureSettings({ viewport: 'mobile', section }).error).toMatch(/section/i)
    }
  })

  it('rejects a body that is not an object', () => {
    expect(parseCaptureSettings(null).error).toBeTruthy()
  })
})

describe('describeCapture', () => {
  it('names the preset, the size, the section and the delay', () => {
    expect(describeCapture({ viewport: VIEWPORT_PRESETS.tablet, delayMs: 500, section: { anchor: '#pricing' } }))
      .toBe('tablet (768×1024), section #pricing, after 500 ms')
    expect(describeCapture({ viewport: { width: 1000, height: 700 }, delayMs: 0, section: { scrollY: 1200 } }))
      .toBe('1000×700, section from 1200 px down')
    expect(describeCapture({ viewport: VIEWPORT_PRESETS.desktop, delayMs: 0, section: null }))
      .toBe('desktop (1920×1080), full page')
  })

  it('calls a section at the very top the first screen', () => {
    expect(describeCapture({ viewport: VIEWPORT_PRESETS.mobile, delayMs: 0, section: { scrollY: 0 } }))
      .toBe('mobile (375×812), first screen only')
  })

  it('names a tablet or phone turned on its side as landscape, and nothing else', () => {
    expect(describeCapture({ viewport: { width: 1024, height: 768 }, delayMs: 0, section: null }))
      .toBe('tablet landscape (1024×768), full page')
    expect(describeCapture({ viewport: { width: 812, height: 375 }, delayMs: 0, section: null }))
      .toBe('mobile landscape (812×375), full page')
    expect(describeCapture({ viewport: { width: 1080, height: 1920 }, delayMs: 0, section: null }))
      .toBe('1080×1920, full page')
  })
})
