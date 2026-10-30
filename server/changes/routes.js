import { Router } from 'express'
import { success, failure } from '../core/http.js'

/**
 * The routes a changes walkthrough adds to the markdown server. `fullDiff`
 * answers only for the files of the walkthrough, by path, and returns null for
 * any other path, so nothing else in the repository can be read through it.
 * With a `repo` of `list()` and `read(path)`, the files of the whole repository
 * are offered as well, and `read` answers null for any path outside its list.
 */
export function createChangesRouter(fullDiff, repo = null) {
  const router = Router()
  if (repo) {
    router.get('/api/changes/files', async (_req, res) => {
      try {
        res.json(success(await repo.list()))
      } catch {
        res.status(500).json(failure('Could not list the files'))
      }
    })
    router.get('/api/changes/file', async (req, res) => {
      try {
        const file = typeof req.query.path === 'string' ? await repo.read(req.query.path) : null
        if (file === null) {
          res.status(404).json(failure('Not a file of this repository'))
          return
        }
        res.json(success(file))
      } catch {
        res.status(500).json(failure('Could not read the file'))
      }
    })
  }
  router.get('/api/changes/full', async (req, res) => {
    try {
      const diff = typeof req.query.path === 'string' ? await fullDiff(req.query.path) : null
      if (diff === null) {
        res.status(404).json(failure('Not a file of this walkthrough'))
        return
      }
      res.json(success({ diff }))
    } catch {
      // git's message names local paths; the page only needs to know it failed.
      res.status(500).json(failure('Could not read the whole file'))
    }
  })
  return router
}
