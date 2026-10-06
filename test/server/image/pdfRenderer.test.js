import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { loadImage } from '@napi-rs/canvas'
import { createPdfRenderer } from '../../../server/image/pdf/renderer.js'
import { makePdf, makeHeavyPdf, makeEncryptedPdf } from '../../helpers/pdfFixtures.js'

describe('createPdfRenderer', () => {
  let dir, pdfPath, heavyPath, encryptedPath, brokenPath

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-pdf-'))
    pdfPath = join(dir, 'deck.pdf')
    heavyPath = join(dir, 'heavy.pdf')
    encryptedPath = join(dir, 'locked.pdf')
    brokenPath = join(dir, 'broken.pdf')
    await writeFile(pdfPath, await makePdf([
      { size: 'slide', title: 'One' }, { size: 'portrait', title: 'Two' }, { size: 'landscape', title: 'Three' }
    ]))
    await writeFile(heavyPath, await makeHeavyPdf(150_000))
    await writeFile(encryptedPath, makeEncryptedPdf())
    await writeFile(brokenPath, 'this is not a pdf')
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reports page count and page sizes without rendering', async () => {
    const renderer = await createPdfRenderer(pdfPath)
    try {
      expect(renderer.pageCount).toBe(3)
      expect(await Promise.all([1, 2, 3].map((page) => renderer.pageSize(page)))).toEqual([
        { width: 960, height: 540 }, { width: 595, height: 842 }, { width: 842, height: 595 }
      ])
    } finally {
      await renderer.close()
    }
  })

  it('renders a page as PNG with its longer side at the requested size', async () => {
    const renderer = await createPdfRenderer(pdfPath)
    try {
      const slide = await renderer.render(1, 2000)
      expect([slide.width, slide.height]).toEqual([2000, 1125])
      const image = await loadImage(slide.buffer)
      expect([image.width, image.height]).toEqual([2000, 1125])

      const thumb = await renderer.render(2, 200)
      expect([thumb.width, thumb.height]).toEqual([141, 200])
    } finally {
      await renderer.close()
    }
  })

  it('reports an encrypted PDF with an actionable message', async () => {
    await expect(createPdfRenderer(encryptedPath)).rejects.toThrow(/Encrypted PDF.*unprotected copy/)
  })

  it('reports a file that is not a PDF', async () => {
    await expect(createPdfRenderer(brokenPath)).rejects.toThrow(/Could not read .*broken\.pdf/)
  })

  it('gives up on a render that takes too long and keeps serving other pages', async () => {
    const renderer = await createPdfRenderer(heavyPath, { timeoutMs: 300 })
    try {
      await expect(renderer.render(1, 2000)).rejects.toThrow(/Page 1 took longer than 300 ms/)
      const next = await renderer.render(2, 200)
      expect(next.width).toBe(200)
    } finally {
      await renderer.close()
    }
  }, 20_000)

  it('gives up on opening a PDF that takes too long to parse', async () => {
    await expect(createPdfRenderer(pdfPath, { openTimeoutMs: 1 })).rejects.toThrow(/Opening deck\.pdf took longer than 1 ms/)
  })

  it('keeps rendering the same document when the file changes on disk', async () => {
    const path = join(dir, 'changing.pdf')
    await writeFile(path, await makeHeavyPdf(150_000))
    const renderer = await createPdfRenderer(path, { timeoutMs: 300 })
    try {
      await writeFile(path, 'replaced by a half-written export')
      // The timeout replaces the worker, which parses the bytes read at the start again.
      await expect(renderer.render(1, 2000)).rejects.toThrow(/took longer/)
      await expect(renderer.render(2, 200)).resolves.toMatchObject({ width: 200 })
    } finally {
      await renderer.close()
    }
  }, 20_000)

  it('runs page renders before queued thumbnails and drops abandoned ones', async () => {
    const renderer = await createPdfRenderer(pdfPath)
    try {
      const order = []
      const abandoned = new AbortController()
      const first = renderer.render(1, 200).then(() => order.push('first'))
      const thumb = renderer.render(2, 200, { priority: 0 }).then(() => order.push('thumb'))
      const page = renderer.render(3, 200, { priority: 1 }).then(() => order.push('page'))
      const gone = renderer.render(2, 200, { priority: 1, signal: abandoned.signal }).catch((error) => error)
      abandoned.abort()
      await Promise.all([first, thumb, page])
      expect(await gone).toMatchObject({ name: 'AbortError' })
      expect(order).toEqual(['first', 'page', 'thumb'])
    } finally {
      await renderer.close()
    }
  })

  it('rejects pending and later renders once closed', async () => {
    const renderer = await createPdfRenderer(heavyPath)
    const pending = renderer.render(1, 2000).catch((error) => error)
    await renderer.close()
    expect(await pending).toBeInstanceOf(Error)
    await expect(renderer.render(2, 200)).rejects.toThrow(/closed/)
  })

  it('rejects a page outside the document', async () => {
    const renderer = await createPdfRenderer(pdfPath)
    try {
      await expect(renderer.render(4, 200)).rejects.toThrow(/Page 4/)
    } finally {
      await renderer.close()
    }
  })
})

describe('pageText', () => {
  let dir, pdfPath

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-pdf-text-'))
    pdfPath = join(dir, 'text.pdf')
    await writeFile(pdfPath, await makePdf([
      { size: 'slide', title: 'Revenue by region', body: ['• North grew 12%', 'South stayed flat'], link: 'https://example.com/q3' },
      { size: 'slide' }
    ]))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reports words and links in the pixels of the rendered page', async () => {
    const renderer = await createPdfRenderer(pdfPath)
    try {
      const { runs, links } = await renderer.pageText(1, 2000)
      expect(runs.slice(0, 3).map((r) => r.str)).toEqual(['Revenue', 'by', 'region'])
      // One run per word, left to right without overlapping.
      expect(runs[1].box.x).toBeGreaterThan(runs[0].box.x + runs[0].box.width)
      expect(runs[2].box.x).toBeGreaterThan(runs[1].box.x + runs[1].box.width)
      const title = runs[0]
      // 40pt at 2000/960 px per point; the title sits 90pt below the top edge.
      expect(title.fontSize).toBeCloseTo(40 * 2000 / 960, 1)
      expect(title.box.x).toBeCloseTo(60 * 2000 / 960, 0)
      expect(title.box.y + title.box.height).toBeGreaterThan(90 * 2000 / 960)
      expect(title.box.y).toBeLessThan(90 * 2000 / 960)
      expect(links).toEqual([{ url: 'https://example.com/q3', box: expect.objectContaining({ x: expect.any(Number) }) }])

      expect(await renderer.pageText(2, 2000)).toEqual({ runs: [], links: [] })
    } finally {
      await renderer.close()
    }
  })
})
