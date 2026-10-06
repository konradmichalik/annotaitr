import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { flattenAnnotations, composeContactSheet } from './render.js'

const OVERVIEW_LAYOUT = { columns: 4, tileWidth: 360 }

function overviewLabel({ page, entries }) {
  return `Page ${page}  #${entries.map((e) => e.number).join(' #')}`
}

/**
 * Render every file the feedback points at into a fresh temp directory: one
 * image per annotated page with its markup and legend, and an overview of
 * those pages. Untouched pages are never written. `pageImage` returns the
 * rendered page as PNG.
 */
export async function writeDocumentOutput(plan, pageImage, pageCount) {
  const dir = await mkdtemp(join(tmpdir(), 'annotaitr-'))
  const digits = Math.max(2, String(pageCount).length)
  try {
    const pages = new Map()
    const overviewTiles = []
    for (const entry of plan) {
      const raw = await pageImage(entry.page)
      const path = join(dir, `page-${String(entry.page).padStart(digits, '0')}.png`)
      await writeFile(path, await flattenAnnotations(raw, entry.entries.map((e) => e.annotation), entry.entries.map((e) => e.number)))
      pages.set(entry.page, path)
      overviewTiles.push({ buffer: raw, label: overviewLabel(entry) })
    }
    let overview = null
    if (overviewTiles.length > 0) {
      overview = join(dir, 'overview.png')
      await writeFile(overview, await composeContactSheet(overviewTiles, OVERVIEW_LAYOUT))
    }
    return { dir, overview, pages }
  } catch (error) {
    // A half-written directory would only ever be found by accident.
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}
