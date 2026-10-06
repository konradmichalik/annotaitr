import { Router } from 'express'
import { success, failure } from '../core/http.js'
import { relative, resolve, dirname, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { readAnnotatableFile, isAnnotatableFile, isPathInside, isPlainTextFile, resolveAnnotatablePath } from './file.js'
import { exportFeedback, exportMultiFileFeedback } from './feedback.js'
import { listWorkspaceFiles } from './workspace.js'
import { config } from './config.js'

export function createApiRouter(filePaths, resolveDecision, origin = 'cli', stores = []) {
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
            isPlainText: isPlainTextFile(store.absolutePath)
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
        isPlainText: isPlainTextFile(filePaths[0])
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
        isPlainText: isPlainTextFile(absolutePath)
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

  // Approving carries any annotations along as notes instead of discarding them
  router.post('/api/approve', (req, res) => {
    const { files } = req.body || {}

    if (Array.isArray(files)) {
      const noteCount = files.reduce(
        (sum, f) => sum + (f.annotations || []).filter(a => a.type !== 'NOTES').length,
        0
      )
      if (noteCount > 0) {
        const notes = exportMultiFileFeedback(files)
        res.json(success({ message: 'Approved with notes' }))
        setTimeout(() => resolveDecision({ approved: true, feedback: notes, annotationCount: noteCount }), 100)
        return
      }
    }

    res.json(success({ message: 'Approved' }))
    setTimeout(() => resolveDecision({ approved: true }), 100)
  })

  router.post('/api/feedback', (req, res) => {
    const { files, annotations, blocks } = req.body

    // Multi-file format
    if (Array.isArray(files)) {
      const feedback = exportMultiFileFeedback(files)
      const totalCount = files.reduce((sum, f) => sum + (f.annotations?.length || 0), 0)
      res.json(success({ message: 'Feedback submitted' }))
      setTimeout(() => resolveDecision({ approved: false, feedback, annotationCount: totalCount }), 100)
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
