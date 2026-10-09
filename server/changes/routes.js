import { Router } from 'express'
import { success, failure } from '../core/http.js'

/**
 * The routes a changes walkthrough adds to the markdown server. `fullDiff`
 * answers only for the files of the walkthrough, by path, and returns null for
 * any other path, so nothing else in the repository can be read through it.
 */
export function createChangesRouter(fullDiff) {
  const router = Router()
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
