import { Router } from 'express'
import { success, failure } from '../core/http.js'
import { relative, resolve, dirname, isAbsolute } from 'node:path'
import { hashOf, displayPath } from './fileNames.js'
import { readAnnotatableFile, isAnnotatableFile, isPathInside, isPlainTextFile, resolveAnnotatablePath } from './file.js'
import { exportMultiFileFeedback, intentSummary } from './feedback.js'
import { listWorkspaceFiles } from './workspace.js'
import { config } from './config.js'
import { freezeReplies } from '../core/session/replyStore.js'
import { sessionFields } from './sessionDecision.js'

/** A per-file id for client-side drafts that stays the same across runs and projects without revealing the path. */
const fileIdOf = hashOf

const BODY_ERROR = 'Request body must contain a "files" array, each file with an "annotations" array'

const isObjectList = (value) => Array.isArray(value) && value.every((item) => item !== null && typeof item === 'object')

/** The submitted files, or null when the body has no usable shape. An approval may leave them out. */
export function submittedFiles(body, { required }) {
  const files = body?.files
  if (files === undefined && !required) { return [] }
  const usable = isObjectList(files) && files.every((f) => isObjectList(f.annotations ?? []) && isObjectList(f.blocks ?? []))
  return usable ? files : null
}

const ownNoteCount = (files) => files.reduce((sum, f) => sum + (f.annotations ?? []).filter((a) => a.type !== 'NOTES').length, 0)

/** What an approval decides: with notes, with replies alone, or nothing to pass along. */
function approval(files, replyCount) {
  const noteCount = ownNoteCount(files)
  if (noteCount > 0) {
    return { message: 'Approved with notes', decision: { approved: true, feedback: exportMultiFileFeedback(files), annotationCount: noteCount, intents: intentSummary(files) } }
  }
  return replyCount > 0
    ? { message: 'Approved with notes', decision: { approved: true, feedback: '', annotationCount: replyCount, repliesOnly: true } }
    : { message: 'Approved', decision: { approved: true } }
}

function feedback(files, replyCount) {
  const noteCount = files.reduce((sum, f) => sum + (f.annotations?.length ?? 0), 0)
  const decision = noteCount === 0 && replyCount > 0
    ? { approved: false, feedback: '', annotationCount: replyCount, repliesOnly: true }
    : { approved: false, feedback: exportMultiFileFeedback(files), annotationCount: noteCount }
  return { message: 'Feedback submitted', decision }
}

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
          const relativePath = displayPath(store.absolutePath)
          const currentHash = hashOf(content)
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
      const relativePath = displayPath(filePaths[0])
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
      const contentHash = hashOf(content)
      const relativePath = displayPath(absolutePath, baseDir)

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
   * waiting CLI a moment later. With a session, the decision also carries
   * what the session records. The caller catches a failure.
   */
  async function decide(res, files, { message, decision }) {
    const frozen = freezeReplies(session?.replies)
    const fields = session ? await sessionFields(stores, files, frozen.carried) : {}
    res.json(success({ message }))
    setTimeout(() => resolveDecision({ ...decision, ...frozen, ...fields }), 100)
  }

  // Express 4 does not catch a rejected handler, so each decision route answers its own failure.
  const decideOrFail = (res, files, outcome) => decide(res, files, outcome)
    .catch((error) => res.status(500).json(failure(error.message)))
  const pendingReplies = () => session?.replies?.count() ?? 0

  // Approving carries any annotations along as notes instead of discarding them
  router.post('/api/approve', (req, res) => {
    const files = submittedFiles(req.body, { required: false })
    if (!files) { return res.status(400).json(failure(BODY_ERROR)) }
    const outcome = approval(files, pendingReplies())
    decideOrFail(res, ownNoteCount(files) > 0 ? files : [], outcome)
  })

  router.post('/api/feedback', (req, res) => {
    const files = submittedFiles(req.body, { required: true })
    if (!files) { return res.status(400).json(failure(BODY_ERROR)) }
    decideOrFail(res, files, feedback(files, pendingReplies()))
  })

  return router
}
