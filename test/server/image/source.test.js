import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, mkdir, writeFile, rm, utimes, symlink } from 'node:fs/promises'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isSourceNewer, siblingPdf } from '../../../server/image/source.js'

const at = (seconds) => new Date(seconds * 1000)

async function touch(path, seconds) {
  await writeFile(path, 'x')
  await utimes(path, at(seconds), at(seconds))
}

describe('isSourceNewer', () => {
  let dir, pdf

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-source-'))
    pdf = join(dir, 'deck.pdf')
    await touch(pdf, 2000)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('compares a file source with the PDF', async () => {
    const source = join(dir, 'deck.pptx')
    await touch(source, 1000)
    expect(await isSourceNewer(source, pdf)).toEqual({ newer: false })
    await touch(source, 3000)
    expect(await isSourceNewer(source, pdf)).toEqual({ newer: true })
  })

  it('uses the newest file inside a directory source, not the directory itself', async () => {
    const source = join(dir, 'deck.key')
    await mkdir(join(source, 'Data'), { recursive: true })
    await touch(join(source, 'Index.zip'), 1000)
    await touch(join(source, 'Data', 'slide.png'), 3000)
    await utimes(source, at(1000), at(1000))
    expect(await isSourceNewer(source, pdf)).toEqual({ newer: true })
  })

  it('ignores dependencies, version control and build output in a directory source', async () => {
    const source = join(dir, 'slides')
    for (const skipped of ['node_modules', '.git', 'dist', 'build']) {
      await mkdir(join(source, skipped), { recursive: true })
      await touch(join(source, skipped, 'file.js'), 3000)
    }
    await touch(join(source, 'slides.md'), 1000)
    expect(await isSourceNewer(source, pdf)).toEqual({ newer: false })
  })

  it('counts a symlinked file with its target', async () => {
    const source = join(dir, 'project')
    await mkdir(source)
    await touch(join(dir, 'outside.md'), 3000)
    await symlink(join(dir, 'outside.md'), join(source, 'slides.md'))
    expect(await isSourceNewer(source, pdf)).toEqual({ newer: true })
  })

  it('skips the check instead of failing when the source cannot be read', async () => {
    expect(await isSourceNewer(join(dir, 'missing'), pdf)).toEqual({ skipped: expect.stringMatching(/could not check/) })
  })

  it('skips the check instead of guessing when a directory holds too many files', async () => {
    const source = join(dir, 'big')
    await mkdir(source)
    await Promise.all(Array.from({ length: 6 }, (_, i) => touch(join(source, `f${i}.txt`), 1000)))
    expect(await isSourceNewer(source, pdf, { maxFiles: 5 })).toEqual({ skipped: expect.stringMatching(/more than 5 files/) })
  })
})

describe('siblingPdf', () => {
  let dir

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-sibling-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('finds a PDF of the same name that is not older than the document', async () => {
    await touch(join(dir, 'deck.pptx'), 1000)
    await touch(join(dir, 'deck.pdf'), 2000)
    expect(await siblingPdf(join(dir, 'deck.pptx'))).toBe(join(dir, 'deck.pdf'))
  })

  it('ignores an outdated or missing PDF', async () => {
    await touch(join(dir, 'deck.pptx'), 3000)
    expect(await siblingPdf(join(dir, 'deck.pptx'))).toBeNull()
    await touch(join(dir, 'deck.pdf'), 2000)
    expect(await siblingPdf(join(dir, 'deck.pptx'))).toBeNull()
  })

  it('handles a package directory with a trailing slash', async () => {
    await mkdir(join(dir, 'deck.key'))
    await touch(join(dir, 'deck.key', 'Index.zip'), 1000)
    await touch(join(dir, 'deck.pdf'), 2000)
    expect(await siblingPdf(`${join(dir, 'deck.key')}/`)).toBe(join(dir, 'deck.pdf'))
  })
})
