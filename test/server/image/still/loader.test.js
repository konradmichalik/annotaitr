import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFile, rm } from 'node:fs/promises'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { loadImageFromFile } from '../../../../server/image/still/loader.js'
import { makeFixturePng } from '../../../helpers/fixtureImage.js'

describe('loadImageFromFile', () => {
  const okPath = join(tmpdir(), `annotaitr-ok-${process.pid}.png`)
  const badExtPath = join(tmpdir(), `annotaitr-bad-${process.pid}.gif`)
  const oversizedPath = join(tmpdir(), `annotaitr-big-${process.pid}.png`)

  afterEach(async () => {
    await rm(okPath, { force: true })
    await rm(badExtPath, { force: true })
    await rm(oversizedPath, { force: true })
  })

  it('rejects an unsupported extension before reading the file', async () => {
    await writeFile(badExtPath, Buffer.from('not-an-image'))
    await expect(loadImageFromFile(badExtPath)).rejects.toThrow(/Unsupported image format/)
  })

  it('rejects a file over the byte-size cap before decoding it', async () => {
    // 16 MB of junk bytes, over the 15 MB cap and not valid PNG data. The
    // size check must happen before any decode is attempted, or this test
    // would fail for the wrong reason.
    await writeFile(oversizedPath, Buffer.alloc(16 * 1024 * 1024, 1))
    await expect(loadImageFromFile(oversizedPath)).rejects.toThrow(/too large/)
  })

  it('loads a valid PNG and reports its dimensions', async () => {
    await writeFile(okPath, makeFixturePng(40, 30))
    const result = await loadImageFromFile(okPath)
    expect(result.width).toBe(40)
    expect(result.height).toBe(30)
    expect(Buffer.isBuffer(result.buffer)).toBe(true)
  })
})

describe('loadImageFromFile with an SVG', () => {
  const svgPath = join(tmpdir(), `annotaitr-svg-${process.pid}.svg`)
  const svg = (attrs) => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><circle cx="12" cy="12" r="10"/></svg>`
  const isPng = (buffer) => buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))

  afterEach(async () => {
    await rm(svgPath, { force: true })
  })

  it('rasterizes a small viewBox-only SVG to a PNG scaled up to 1600px on its longer side', async () => {
    await writeFile(svgPath, svg('viewBox="0 0 24 12"'))
    const result = await loadImageFromFile(svgPath)
    expect(result.width).toBe(1600)
    expect(result.height).toBe(800)
    expect(isPng(result.buffer)).toBe(true)
  })

  it('keeps the intrinsic size of an SVG that is already large enough', async () => {
    await writeFile(svgPath, svg('width="2000" height="1000"'))
    const result = await loadImageFromFile(svgPath)
    expect(result.width).toBe(2000)
    expect(result.height).toBe(1000)
    expect(isPng(result.buffer)).toBe(true)
  })

  it('paints an opaque white background behind transparent SVG content', async () => {
    await writeFile(svgPath, svg('width="1600" height="1600"'))
    const { buffer } = await loadImageFromFile(svgPath)
    const image = await loadImage(buffer)
    const ctx = createCanvas(image.width, image.height).getContext('2d')
    ctx.drawImage(image, 0, 0)
    expect([...ctx.getImageData(0, 0, 1, 1).data]).toEqual([255, 255, 255, 255])
  })

  it('scales an explicitly sized SVG up and renders its content at the new size', async () => {
    await writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="red"/></svg>')
    const result = await loadImageFromFile(svgPath)
    expect([result.width, result.height]).toEqual([1600, 800])
    const image = await loadImage(result.buffer)
    const ctx = createCanvas(image.width, image.height).getContext('2d')
    ctx.drawImage(image, 0, 0)
    expect([...ctx.getImageData(1590, 790, 1, 1).data]).toEqual([255, 0, 0, 255])
  })

  it('scales an SVG with huge declared dimensions down to 8000px instead of allocating them', async () => {
    await writeFile(svgPath, svg('width="200000" height="10000"'))
    const result = await loadImageFromFile(svgPath)
    expect([result.width, result.height]).toEqual([8000, 400])
  })

  it('scales a huge viewBox-only SVG down to 8000px', async () => {
    await writeFile(svgPath, svg('viewBox="0 0 1e9 1e7"'))
    const result = await loadImageFromFile(svgPath)
    expect([result.width, result.height]).toEqual([8000, 80])
  })

  it('takes the size from the viewBox when width and height are relative', async () => {
    await writeFile(svgPath, svg('width="100%" height="100%" viewBox="0 0 40 20"'))
    const result = await loadImageFromFile(svgPath)
    expect([result.width, result.height]).toEqual([1600, 800])
  })

  it('finds the root <svg> tag behind a long prolog', async () => {
    await writeFile(svgPath, `<?xml version="1.0"?>\n<!-- ${'x'.repeat(9000)} -->\n${svg('width="400" height="200"')}`)
    const result = await loadImageFromFile(svgPath)
    expect([result.width, result.height]).toEqual([1600, 800])
  })

  it('ignores an <svg> tag inside a comment before the real root', async () => {
    await writeFile(svgPath, `<!-- old: <svg width="10" height="10"> -->\n${svg('width="400" height="200"')}`)
    const result = await loadImageFromFile(svgPath)
    expect([result.width, result.height]).toEqual([1600, 800])
  })

  it('reads the size past a quoted attribute containing >', async () => {
    await writeFile(svgPath, svg('aria-label="A > B" width="400" height="200"'))
    const result = await loadImageFromFile(svgPath)
    expect([result.width, result.height]).toEqual([1600, 800])
  })

  it('rejects a width or height that overflows to Infinity', async () => {
    await writeFile(svgPath, svg('width="1e309" height="100"'))
    await expect(loadImageFromFile(svgPath)).rejects.toThrow(/no usable size/)
  })

  it('rejects a viewBox that overflows to Infinity', async () => {
    await writeFile(svgPath, svg('viewBox="0 0 1e309 100"'))
    await expect(loadImageFromFile(svgPath)).rejects.toThrow(/no usable size/)
  })

  it('rejects an SVG without width, height, or viewBox', async () => {
    await writeFile(svgPath, svg(''))
    await expect(loadImageFromFile(svgPath)).rejects.toThrow(/no usable size/)
  })

  it('rejects an SVG sized only in relative units', async () => {
    await writeFile(svgPath, svg('width="10em" height="5em"'))
    await expect(loadImageFromFile(svgPath)).rejects.toThrow(/no usable size/)
  })

  it('rejects an SVG whose body is malformed', async () => {
    await writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect</svg>')
    await expect(loadImageFromFile(svgPath)).rejects.toThrow(/Invalid SVG/)
  })

  it('rejects malformed SVG markup', async () => {
    await writeFile(svgPath, '<svg nope')
    await expect(loadImageFromFile(svgPath)).rejects.toThrow()
  })
})

vi.mock('playwright', () => {
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png-bytes')),
    evaluate: vi.fn().mockResolvedValue({ width: 1920, height: 3000 }),
    waitForTimeout: vi.fn().mockResolvedValue(undefined)
  }
  const browser = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined)
  }
  return {
    chromium: {
      launch: vi.fn().mockResolvedValue(browser)
    },
    __mockPage: page,
    __mockBrowser: browser
  }
})

describe('captureUrl', () => {
  it('returns the screenshot buffer and page dimensions', async () => {
    const { captureUrl } = await import('../../../../server/image/still/loader.js')
    const result = await captureUrl('http://localhost:3000', { width: 1920, height: 1080 })
    expect(result.buffer).toEqual(Buffer.from('fake-png-bytes'))
    expect(result.width).toBe(1920)
    expect(result.height).toBe(3000)
  })

  it('returns a DOM map of the captured page alongside the screenshot', async () => {
    const playwright = await import('playwright')
    const rawElement = {
      x: 10, y: 20, width: 100, height: 50, tag: 'img', role: '', text: '', alt: 'Team photo', ariaLabel: '', title: '',
      src: 'https://x.test/team.jpg?v=2', self: { tag: 'img', id: '', cls: '' }, ancestors: [{ tag: 'main', id: '', cls: '' }]
    }
    playwright.__mockPage.evaluate
      .mockResolvedValueOnce({ width: 1920, height: 3000 })
      .mockResolvedValueOnce([rawElement])
    const { captureUrl } = await import('../../../../server/image/still/loader.js')
    const result = await captureUrl('http://localhost:3000', { width: 1920, height: 1080 })
    expect(result.domMap).toEqual([
      { tag: 'img', role: '', name: 'Team photo', media: 'team.jpg', selector: 'main img', heading: '', box: { x: 10, y: 20, width: 100, height: 50 } }
    ])
  })

  it('still captures the page with an empty DOM map when collecting it fails', async () => {
    const playwright = await import('playwright')
    playwright.__mockPage.evaluate
      .mockResolvedValueOnce({ width: 1920, height: 3000 })
      .mockRejectedValueOnce(new Error('Execution context was destroyed'))
    const { captureUrl } = await import('../../../../server/image/still/loader.js')
    const result = await captureUrl('http://localhost:3000', { width: 1920, height: 1080 })
    expect(result.buffer).toEqual(Buffer.from('fake-png-bytes'))
    expect(result.domMap).toEqual([])
  })

  it('waits the given delay after load before taking the screenshot', async () => {
    const playwright = await import('playwright')
    const { __mockPage: page } = playwright
    page.waitForTimeout.mockClear()
    const { captureUrl } = await import('../../../../server/image/still/loader.js')
    await captureUrl('http://localhost:3000', { width: 1920, height: 1080 }, { delayMs: 500 })
    expect(page.waitForTimeout).toHaveBeenCalledWith(500)
    expect(page.waitForTimeout.mock.invocationCallOrder[0]).toBeLessThan(page.screenshot.mock.invocationCallOrder.at(-1))
  })

  it('captures only the visible viewport after scrolling to a section, with element boxes in that frame', async () => {
    const playwright = await import('playwright')
    const { __mockPage: page } = playwright
    page.screenshot.mockClear()
    page.evaluate.mockClear()
    page.evaluate.mockResolvedValueOnce(true).mockResolvedValueOnce([])
    const { captureUrl } = await import('../../../../server/image/still/loader.js')
    const result = await captureUrl('http://localhost:3000', { width: 375, height: 812 }, { section: { anchor: '#pricing' } })
    expect(page.screenshot).toHaveBeenCalledWith({ fullPage: false, type: 'png' })
    expect([result.width, result.height]).toEqual([375, 812])
    expect(page.evaluate.mock.calls[0][1]).toEqual({ anchor: '#pricing' })
    expect(page.evaluate.mock.calls[1][1]).toMatchObject({ viewportOnly: true })
  })

  it('scrolls to a pixel position for a scrollY section', async () => {
    const playwright = await import('playwright')
    const { __mockPage: page } = playwright
    page.evaluate.mockClear()
    page.evaluate.mockResolvedValueOnce(true).mockResolvedValueOnce([])
    const { captureUrl } = await import('../../../../server/image/still/loader.js')
    await captureUrl('http://localhost:3000', { width: 375, height: 812 }, { section: { scrollY: 1200 } })
    expect(page.evaluate.mock.calls[0][1]).toEqual({ scrollY: 1200 })
  })

  it('fails with a clear message when the anchor is not on the page, and still closes the browser', async () => {
    const playwright = await import('playwright')
    playwright.__mockPage.evaluate.mockResolvedValueOnce(false)
    playwright.__mockBrowser.close.mockClear()
    const { captureUrl } = await import('../../../../server/image/still/loader.js')
    await expect(captureUrl('http://localhost:3000', { width: 375, height: 812 }, { section: { anchor: '#missing' } }))
      .rejects.toThrow(/#missing.*not found/)
    expect(playwright.__mockBrowser.close).toHaveBeenCalled()
  })

  it('closes the browser even when navigation fails', async () => {
    const playwright = await import('playwright')
    playwright.__mockPage.goto.mockRejectedValueOnce(new Error('net::ERR_CONNECTION_REFUSED'))
    const { captureUrl } = await import('../../../../server/image/still/loader.js')
    await expect(captureUrl('http://localhost:9999', { width: 1920, height: 1080 })).rejects.toThrow(
      /ERR_CONNECTION_REFUSED/
    )
    expect(playwright.__mockBrowser.close).toHaveBeenCalled()
  })

  it('rejects a non-http(s) URL before launching a browser', async () => {
    const playwright = await import('playwright')
    playwright.chromium.launch.mockClear()
    const { captureUrl } = await import('../../../../server/image/still/loader.js')
    await expect(captureUrl('file:///etc/passwd', { width: 1920, height: 1080 })).rejects.toThrow(
      /Unsupported URL/
    )
    expect(playwright.chromium.launch).not.toHaveBeenCalled()
  })

  it('rejects a screenshot over the byte-size cap and still closes the browser', async () => {
    const playwright = await import('playwright')
    playwright.__mockPage.screenshot.mockResolvedValueOnce(Buffer.alloc(16 * 1024 * 1024, 1))
    const { captureUrl } = await import('../../../../server/image/still/loader.js')
    await expect(captureUrl('http://localhost:3000', { width: 1920, height: 1080 })).rejects.toThrow(/too large/)
    expect(playwright.__mockBrowser.close).toHaveBeenCalled()
  })

  it('rejects a screenshot over the pixel-dimension cap and still closes the browser', async () => {
    const playwright = await import('playwright')
    playwright.__mockPage.evaluate.mockResolvedValueOnce({ width: 1920, height: 25000 })
    const { captureUrl } = await import('../../../../server/image/still/loader.js')
    await expect(captureUrl('http://localhost:3000', { width: 1920, height: 1080 })).rejects.toThrow(
      /dimensions too large/
    )
    expect(playwright.__mockBrowser.close).toHaveBeenCalled()
  })
})
