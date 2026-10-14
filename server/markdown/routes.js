import { Router } from 'express'
import { success, failure } from '../core/http.js'
import { relative, resolve, dirname, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { readAnnotatableFile, isAnnotatableFile, isPathInside, isPlainTextFile, resolveAnnotatablePath } from './file.js'
import { exportFeedback, exportMultiFileFeedback, intentSummary } from './feedback.js'
import { listWorkspaceFiles } from './workspace.js'
import { config } from './config.js'
import { freezeReplies } from '../core/session/replyStore.js'
import { sessionFields } from './sessionDecision.js'

/** A per-file id for client-side drafts that stays the same across runs and projects without revealing the path. */
const fileIdOf = (absolutePath) => createHash('sha256').update(absolutePath).digest('hex')

/** `session` is the opened review session, or null when the review keeps none (the OpenCode plugin). */
export function createApiRouter(filePaths, resolveDecision, origin = 'cli', stores = [], session = null) {
  const router = Router()

  // Workspace file listing for @-reference autocomplete
  router.get('/api/workspace/files', async (_req, res) => {
    try {
      const files = await listWorkspaceFiles()
      res.json(success({ files }))
    } catch (error) {
      res.status(500).json(failure(error.message))
    }
  })

  // Multi-file endpoint — returns all files
  router.get('/api/files', async (_req, res) => {
    try {
      const files = await Promise.all(
        stores.map(async (store, index) => {
          const content = await readAnnotatableFile(store.absolutePath)
          const relativePath = relative(process.cwd(), store.absolutePath) || store.absolutePath
          const currentHash = createHash('sha256').update(content).digest('hex')
          return {
            index,
            path: relativePath,
            content,
            contentHash: currentHash,
            hashMismatch: currentHash !== store.contentHash,
            isPlainText: isPlainTextFile(store.absolutePath),
            kind: store.kind ?? 'document',
            label: store.label ?? null,
            // The walkthrough is regenerated at the same path every run, so a path draft would only mislead.
            fileId: store.kind === 'changes' ? null : fileIdOf(store.absolutePath)
          }
        })
      )
      res.json(success({ files, origin, config: { plantumlServerUrl: config.plantumlServerUrl, krokiServerUrl: config.krokiServerUrl } }))
    } catch (error) {
      res.status(500).json(failure(error.message))
    }
  })

  // Single-file endpoint — backward compat (returns first file)
  router.get('/api/file', async (_req, res) => {
    try {
      const content = await readAnnotatableFile(filePaths[0])
      const relativePath = relative(process.cwd(), filePaths[0]) || filePaths[0]
      res.json(success({
        content,
        path: relativePath,
        origin,
        contentHash: stores[0]?.contentHash || null,
        isPlainText: isPlainTextFile(filePaths[0]),
        fileId: stores[0]?.kind === 'changes' ? null : fileIdOf(stores[0]?.absolutePath ?? filePaths[0])
      }))
    } catch (error) {
      res.status(500).json(failure(error.message))
    }
  })

  // Open a linked file (linked navigation)
  const baseDir = process.cwd()

  router.get('/api/file/open', async (req, res) => {
    const { path: requestedPath, relativeTo } = req.query
    if (!requestedPath) {
      return res.status(400).json(failure('path query parameter required'))
    }

    const referenceDir = relativeTo
      ? dirname(resolve(baseDir, relativeTo))
      : dirname(filePaths[0])
    // A directory target (`docs/routing/`) stands for its index document
    const absolutePath = await resolveAnnotatablePath(resolve(referenceDir, requestedPath))

    const rel = relative(baseDir, absolutePath)
    if (rel.startsWith('..') || rel === '' || isAbsolute(rel)) {
      return res.status(403).json(failure('Access denied: path outside project directory'))
    }

    // The lexical check above cannot see through a symbolic link
    if (!await isPathInside(baseDir, absolutePath)) {
      return res.status(403).json(failure('Access denied: path outside project directory'))
    }

    if (!isAnnotatableFile(absolutePath)) {
      return res.status(400).json(failure('Unsupported file type'))
    }

    try {
      const content = await readAnnotatableFile(absolutePath)
      const contentHash = createHash('sha256').update(content).digest('hex')
      const relativePath = relative(baseDir, absolutePath) || absolutePath

      let fileIndex = stores.findIndex(s => s.absolutePath === absolutePath)
      if (fileIndex === -1) {
        stores.push({ absolutePath, contentHash, annotations: [] })
        fileIndex = stores.length - 1
      }

      res.json(success({
        index: fileIndex,
        path: relativePath,
        content,
        contentHash,
        isPlainText: isPlainTextFile(absolutePath),
        fileId: fileIdOf(absolutePath)
      }))
    } catch (error) {
      res.status(404).json(failure(error.message))
    }
  })

  // Annotations: scoped by fileIndex query param (default 0)
  router.get('/api/annotations', (req, res) => {
    const fileIndex = parseInt(req.query.fileIndex, 10) || 0
    const store = stores[fileIndex]
    if (!store) {
      return res.json(success({ annotations: [], contentHash: null }))
    }
    res.json(success({
      annotations: store.annotations,
      contentHash: store.contentHash
    }))
  })

  router.post('/api/annotations', (req, res) => {
    const { annotations, fileIndex = 0 } = req.body
    const store = stores[fileIndex]
    if (!store) {
      return res.json(success({ saved: false }))
    }
    if (!Array.isArray(annotations)) {
      return res.status(400).json(failure('annotations must be an array'))
    }
    store.annotations = [...annotations]
    res.json(success({ saved: true, count: annotations.length }))
  })

  /**
   * Freeze the replies, answer the browser and hand the decision to the
   * waiting CLI a moment later. `build(frozen)` returns the `message` and the
   * `decision`; with a session, the decision also carries what it records.
   */
  async function decide(res, files, build) {
    const frozen = freezeReplies(session?.replies)
    const { message, decision } = build(frozen)
    try {
      const fields = session ? await sessionFields(stores, files, frozen.carried) : {}
      res.json(success({ message }))
      setTimeout(() => resolveDecision({ ...decision, ...frozen, ...fields }), 100)
    } catch (error) {
      res.status(500).json(failure(error.message))
    }
  }

  // Approving carries any annotations along as notes instead of discarding them
  router.post('/api/approve', (req, res) => {
    const files = Array.isArray(req.body?.files) ? req.body.files : []
    const noteCount = files.reduce((sum, f) => sum + (f.annotations || []).filter(a => a.type !== 'NOTES').length, 0)
    decide(res, noteCount > 0 ? files : [], (frozen) => {
      if (noteCount > 0) {
        return { message: 'Approved with notes', decision: { approved: true, feedback: exportMultiFileFeedback(files), annotationCount: noteCount, intents: intentSummary(files) } }
      }
      return frozen.replyCount > 0
        ? { message: 'Approved with notes', decision: { approved: true, feedback: '', annotationCount: frozen.replyCount, repliesOnly: true } }
        : { message: 'Approved', decision: { approved: true } }
    })
  })

  router.post('/api/feedback', (req, res) => {
    const { files, annotations, blocks } = req.body

    // Multi-file format
    if (Array.isArray(files)) {
      const totalCount = files.reduce((sum, f) => sum + (f.annotations?.length || 0), 0)
      decide(res, files, (frozen) => {
        const repliesOnly = totalCount === 0 && frozen.replyCount > 0
        return {
          message: 'Feedback submitted',
          decision: repliesOnly
            ? { approved: false, feedback: '', annotationCount: frozen.replyCount, repliesOnly }
            : { approved: false, feedback: exportMultiFileFeedback(files), annotationCount: totalCount }
        }
      })
      return
    }

    // Single-file backward compat
    if (!Array.isArray(annotations) || !Array.isArray(blocks)) {
      return res.status(400).json(failure('Request body must contain "files" array or "annotations" and "blocks" arrays'))
    }

    const feedback = exportFeedback(annotations, blocks)
    res.json(success({ message: 'Feedback submitted' }))
    setTimeout(() => resolveDecision({ approved: false, feedback, annotationCount: annotations.length }), 100)
  })

  return router
}
