/**
 * Images the reviewer attaches to a note. The server picks every file name and
 * serves and prints only files from its own folder, so a note can never point
 * the agent or the page at another file on disk.
 */

import express, { Router } from 'express'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { lstatSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { mkdir, writeFile, readdir, lstat, rm } from 'node:fs/promises'
import { success, failure } from '../core/http.js'
import { imageType } from '../core/imageType.js'
import { assertPrivateDir, isPrivateDir, RESUME_WINDOW_MS } from '../core/session/store.js'

export const MAX_ATTACHMENTS = 5
const UPLOAD_LIMIT = '10mb'
const EXTENSIONS = { png: 'png', jpeg: 'jpg', webp: 'webp' }
const ATTACHMENT_ID = /^[0-9a-f]{32}\.(png|jpg|webp)$/

export const attachmentDir = () => join(tmpdir(), 'annotaitr-attachments')

// A symlink or another user's file in a planted folder would hand out whatever it points at.
const isOwnFile = (info) => Boolean(info?.isFile()) && (typeof process.getuid !== 'function' || info.uid === process.getuid())

const isAttachmentPath = (path, dir) => typeof path === 'string' && dirname(path) === dir && ATTACHMENT_ID.test(basename(path)) &&
  isPrivateDir(lstatSync(dir, { throwIfNoEntry: false })) && isOwnFile(lstatSync(path, { throwIfNoEntry: false }))

const isPrivate = (dir) => assertPrivateDir(dir).then(() => true, () => false)

/** The `Attachment:` lines under a note's heading, one per image the server still holds. */
export function attachmentLines(ann, dir = attachmentDir()) {
  const paths = (Array.isArray(ann.attachments) ? ann.attachments : [])
    .map((attachment) => attachment?.path)
    .filter((path) => isAttachmentPath(path, dir))
  return paths.slice(0, MAX_ATTACHMENTS).map((path) => `Attachment: ${path}\n`).join('')
}

const NAME_LIMIT = 120

/** The note as a later round keeps it: the names of its images, not their files, which are pruned after a day. */
export function withAttachmentNames(ann) {
  if (!Array.isArray(ann.attachments)) { return ann }
  const names = ann.attachments
    .filter((attachment) => typeof attachment?.name === 'string')
    .map(({ name }) => ({ name: name.slice(0, NAME_LIMIT) }))
  return { ...ann, attachments: names }
}

export function createAttachmentsRouter({ dir = attachmentDir() } = {}) {
  const router = Router()

  router.put('/api/attachments', express.raw({ type: 'image/*', limit: UPLOAD_LIMIT }), async (req, res) => {
    const type = Buffer.isBuffer(req.body) ? imageType(req.body) : null
    if (!type) { return res.status(400).json(failure('An attachment must be a PNG, JPEG or WebP image')) }
    const id = `${randomBytes(16).toString('hex')}.${EXTENSIONS[type]}`
    // Express 4 does not catch a rejected async handler.
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 })
      await assertPrivateDir(dir)
      const path = join(dir, id)
      await writeFile(path, req.body, { flag: 'wx', mode: 0o600 })
      res.json(success({ id, path }))
    } catch (error) {
      console.error(error)
      res.status(500).json(failure('Could not store the attachment'))
    }
  })

  router.get('/api/attachments/:id', async (req, res) => {
    const { id } = req.params
    const path = join(dir, id)
    const servable = ATTACHMENT_ID.test(id) && await isPrivate(dir) && isOwnFile(await lstat(path).catch(() => null))
    if (!servable) { return res.status(404).json(failure('No such attachment')) }
    res.sendFile(path)
  })

  return router
}

// Attachments belong to one round, and a review resumes for 24 hours at most.
// Best effort: a file we may not delete must never stop a review.
export async function pruneAttachments(now, dir = attachmentDir()) {
  if (!await isPrivate(dir)) { return 0 }
  const names = await readdir(dir).catch(() => [])
  let removed = 0
  for (const name of names.filter((n) => ATTACHMENT_ID.test(n))) {
    const path = join(dir, name)
    const info = await lstat(path).catch(() => null)
    if (info && now - info.mtimeMs > RESUME_WINDOW_MS) {
      const gone = await rm(path, { force: true }).then(() => true, () => false)
      if (gone) { removed++ }
    }
  }
  return removed
}
