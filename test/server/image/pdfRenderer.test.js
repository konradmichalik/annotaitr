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
      expect(renderer.pageSizes).toEqual([
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

  it('rejects a page outside the document', async () => {
    const renderer = await createPdfRenderer(pdfPath)
    try {
      await expect(renderer.render(4, 200)).rejects.toThrow(/Page 4/)
    } finally {
      await renderer.close()
    }
  })
})
