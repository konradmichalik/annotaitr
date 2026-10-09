/**
 * Markdown-mode adapter: wires the shared server bootstrap (server/core/server.js)
 * to the markdown API router and the markdown client bundle, plus the
 * file-reading and feedback-notes resolution that's specific to this mode.
 */

import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { startAnnotatorServer } from '../core/server.js'
import { createApiRouter } from './routes.js'
import { readAnnotatableFile } from './file.js'
import { convertNotesToAnnotations } from './notes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '..', '..', 'client', 'dist', 'markdown')
const DEV_DIR = join(__dirname, '..', '..', 'client', 'markdown')
const bundleDir = existsSync(join(DIST_DIR, 'index.html')) ? DIST_DIR : DEV_DIR

/**
 * Resolve notes for a specific file from the feedbackNotes array.
 * Notes apply to the first file only (multi-file uses one invocation per file).
 */
function resolveNotesForFile(feedbackNotes, fileIndex, content) {
  if (!Array.isArray(feedbackNotes) || fileIndex !== 0) {
    return []
  }
  return convertNotesToAnnotations(feedbackNotes, content)
}

/**
 * Start the markdown annotator server for one or more files.
 *
 * @param {Object} options
 * @param {string[]} options.filePaths - absolute paths to markdown/plain-text files
 * @param {string} [options.origin='cli']
 * @param {Array} [options.feedbackNotes] - AI notes to attach to the first file
 * @param {string} [options.kind] - 'changes' for a walkthrough from `annotaitr changes`, which the client lays out like a pull request
 * @param {string} [options.htmlContent] - pre-loaded HTML to serve instead of the
 *   built client/dist bundle (used by apps/opencode, which bundles its own copy)
 * @param {Function} [options.onReady] - (url, port) => void
 */
export async function buildMarkdownServer(options) {
  const { filePaths, origin = 'cli', feedbackNotes = null, kind = 'document', htmlContent = null, onReady = null } = options

  // Compute content hash per file for annotation persistence. A read failure
  // here (e.g. a file over the size limit) must reject startup — swallowing
  // it would let the server come up with a store /api/files can never serve.
  const stores = await Promise.all(
    filePaths.map(async (fp, index) => {
      const content = await readAnnotatableFile(fp)
      const contentHash = createHash('sha256').update(content).digest('hex')
      const notes = resolveNotesForFile(feedbackNotes, index, content)
      return { absolutePath: fp, contentHash, annotations: notes, kind }
    })
  )

  // Serve static files from each annotated file's directory (relative images,
  // etc.), plus cwd as a fallback for absolute-style paths. A changes
  // walkthrough references no files, and its cwd is a source tree that may hold secrets.
  const servedDirs = new Set(kind === 'changes' ? [] : filePaths.map(dirname))
  if (kind !== 'changes') { servedDirs.add(process.cwd()) }

  return startAnnotatorServer({
    bundleDir,
    htmlContent,
    staticDirs: [...servedDirs],
    onReady,
    mountRoutes(app, { safeResolve }) {
      app.use(createApiRouter(filePaths, safeResolve, origin, stores))
    }
  })
}
