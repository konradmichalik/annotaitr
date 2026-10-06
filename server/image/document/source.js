import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

/**
 * The file a PDF was rendered from (--source) and whether that rendering is
 * still current. Dependency-free, so index.js can use it for the convert
 * hint without loading pdf.js.
 */

// A package directory (.key, .pages) or a project (Slidev) changes inside
// without touching its own mtime. Dependencies, version control and build
// output change without changing what renders, so they never count.
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'build'])
const MAX_FILES = 5000

async function newestFileMtime(dir, maxFiles) {
  let newest = 0
  let files = 0
  const pending = [dir]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name)) { continue }
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(path)
        continue
      }
      // A symlinked file counts with its target's mtime. A symlinked
      // directory is not followed, which also rules out loops.
      const stats = entry.isFile() || entry.isSymbolicLink() ? await stat(path).catch(() => null) : null
      if (stats?.isFile()) {
        files += 1
        if (files > maxFiles) { return null }
        newest = Math.max(newest, stats.mtimeMs)
      }
    }
  }
  return newest
}

async function sourceMtime(path, maxFiles) {
  const stats = await stat(path)
  return stats.isDirectory() ? newestFileMtime(path, maxFiles) : stats.mtimeMs
}

/**
 * `{ newer }`, or `{ skipped }` with the reason when the source cannot be
 * compared (too many files, unreadable). The check only ever warns, so it
 * never fails the review.
 */
export async function isSourceNewer(sourcePath, pdfPath, { maxFiles = MAX_FILES } = {}) {
  let source
  try {
    source = await sourceMtime(sourcePath, maxFiles)
  } catch (error) {
    return { skipped: `could not check whether the PDF is outdated: ${error.message}` }
  }
  if (source === null) {
    return { skipped: `the source holds more than ${maxFiles} files, not checked whether the PDF is outdated` }
  }
  return { newer: source > (await stat(pdfPath)).mtimeMs }
}

/**
 * The document path without the trailing slash shell completion adds to a
 * package directory, and the PDF of the same name next to it.
 */
export function pdfPathFor(documentPath) {
  const document = documentPath.replace(/[/\\]+$/, '')
  return { document, pdf: join(dirname(document), `${basename(document, extname(document))}.pdf`) }
}

/** A PDF next to the document with the same name and not older than it, or null. */
export async function siblingPdf(documentPath) {
  const { document, pdf: pdfPath } = pdfPathFor(documentPath)
  try {
    const result = await isSourceNewer(document, pdfPath)
    return result.newer === false ? pdfPath : null
  } catch {
    return null
  }
}
