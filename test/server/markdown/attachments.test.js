import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readdir, utimes, stat, mkdir, symlink, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import {
  createAttachmentsRouter, attachmentLines, pruneAttachments, MAX_ATTACHMENTS
} from '../../../server/markdown/attachments.js'
import { RESUME_WINDOW_MS } from '../../../server/core/session/store.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')

describe('attachments', () => {
  let root
  let dir

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'annotaitr-attachments-test-'))
    dir = join(root, 'annotaitr-attachments')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function serve() {
    const app = express()
    app.use(express.json())
    app.use(createAttachmentsRouter({ dir }))
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
  }

  const upload = (url, body, type = 'image/png') => fetch(`${url}/api/attachments`, { method: 'PUT', headers: { 'Content-Type': type }, body })

  describe('PUT /api/attachments', () => {
    it.each([['png', PNG, 'image/png'], ['jpg', JPEG, 'image/jpeg'], ['webp', WEBP, 'image/webp']])('stores a %s under a name the server picks', async (ext, body, type) => {
      const server = await serve()
      try {
        const res = await upload(server.url, body, type)
        expect(res.status).toBe(200)
        const { data } = await res.json()
        expect(data.id).toMatch(new RegExp(`^[0-9a-f]{32}\\.${ext}$`))
        expect(data.path).toBe(join(dir, data.id))
        expect(await readdir(dir)).toEqual([data.id])
      } finally { server.close() }
    })

    it('trusts the bytes, not the content type', async () => {
      const server = await serve()
      try {
        const res = await upload(server.url, JPEG, 'image/png')
        expect((await res.json()).data.id).toMatch(/\.jpg$/)
      } finally { server.close() }
    })

    it.each([['an SVG', SVG, 'image/svg+xml'], ['text sent as an image', Buffer.from('hello'), 'image/png'], ['an empty body', Buffer.alloc(0), 'image/png']])('rejects %s', async (_name, body, type) => {
      const server = await serve()
      try {
        const res = await upload(server.url, body, type)
        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('An attachment must be a PNG, JPEG or WebP image')
      } finally { server.close() }
    })

    it('rejects an image over the size limit', async () => {
      const server = await serve()
      try {
        const res = await upload(server.url, Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]))
        expect(res.status).toBe(413)
      } finally { server.close() }
    })

    it('creates the folder closed to others', async () => {
      const server = await serve()
      try {
        await upload(server.url, PNG)
        expect((await stat(dir)).mode & 0o777).toBe(0o700)
      } finally { server.close() }
    })
  })

  describe('GET /api/attachments/:id', () => {
    it('serves an uploaded image with its type', async () => {
      const server = await serve()
      try {
        const { data } = await (await upload(server.url, WEBP, 'image/webp')).json()
        const res = await fetch(`${server.url}/api/attachments/${data.id}`)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe('image/webp')
        expect(Buffer.from(await res.arrayBuffer())).toEqual(WEBP)
      } finally { server.close() }
    })

    it.each(['..%2F..%2Fetc%2Fpasswd', 'notes.md', `${'a'.repeat(32)}.svg`, `${'a'.repeat(32)}.png`])('answers 404 for %s', async (id) => {
      const server = await serve()
      try {
        await writeFile(join(root, 'notes.md'), 'secret')
        const res = await fetch(`${server.url}/api/attachments/${id}`)
        expect(res.status).toBe(404)
      } finally { server.close() }
    })
  })

  // On Linux tmpdir() is the shared /tmp, where another user may create the folder first.
  describe('a folder or file someone else planted', () => {
    const planted = `${'d'.repeat(32)}.png`

    async function plantSymlink(mode = 0o700) {
      await mkdir(dir, { mode })
      await chmod(dir, mode)
      await writeFile(join(root, 'secret.txt'), 'secret')
      await symlink(join(root, 'secret.txt'), join(dir, planted))
    }

    it('serves no symlink, even inside a private folder', async () => {
      await plantSymlink()
      const server = await serve()
      try {
        expect((await fetch(`${server.url}/api/attachments/${planted}`)).status).toBe(404)
      } finally { server.close() }
    })

    it('serves nothing from a folder open to others', async () => {
      await mkdir(dir, { mode: 0o755 })
      await chmod(dir, 0o755)
      await writeFile(join(dir, planted), PNG)
      const server = await serve()
      try {
        expect((await fetch(`${server.url}/api/attachments/${planted}`)).status).toBe(404)
      } finally { server.close() }
    })

    it('prints no symlink as an attachment', async () => {
      await plantSymlink()
      expect(attachmentLines({ attachments: [{ path: join(dir, planted), name: 'x.png' }] }, dir)).toBe('')
    })

    it('prunes nothing in a folder open to others', async () => {
      await mkdir(dir, { mode: 0o755 })
      await chmod(dir, 0o755)
      await writeFile(join(dir, planted), PNG)
      const past = (Date.now() - RESUME_WINDOW_MS - 1000) / 1000
      await utimes(join(dir, planted), past, past)
      expect(await pruneAttachments(Date.now(), dir)).toBe(0)
      expect(await readdir(dir)).toEqual([planted])
    })
  })

  describe('attachmentLines', () => {
    it('names each stored attachment of a note', async () => {
      const server = await serve()
      try {
        const { data } = await (await upload(server.url, PNG)).json()
        expect(attachmentLines({ attachments: [{ path: data.path, name: 'shot.png' }] }, dir)).toBe(`Attachment: ${data.path}\n`)
      } finally { server.close() }
    })

    it('leaves out a path the server did not write, or one that is gone', async () => {
      await writeFile(join(root, 'notes.md'), 'secret')
      const ann = { attachments: [
        { path: join(root, 'notes.md'), name: 'x' },
        { path: join(dir, `${'b'.repeat(32)}.png`), name: 'gone.png' },
        { path: '/etc/passwd' },
        null
      ] }
      expect(attachmentLines(ann, dir)).toBe('')
      expect(attachmentLines({}, dir)).toBe('')
    })

    it(`prints at most ${MAX_ATTACHMENTS} per note`, async () => {
      const server = await serve()
      try {
        const uploads = await Promise.all(Array.from({ length: MAX_ATTACHMENTS + 1 }, async () => (await (await upload(server.url, PNG)).json()).data))
        const lines = attachmentLines({ attachments: uploads.map(({ path }) => ({ path, name: 'a.png' })) }, dir)
        expect(lines.trim().split('\n')).toHaveLength(MAX_ATTACHMENTS)
      } finally { server.close() }
    })
  })

  describe('pruneAttachments', () => {
    it('removes images older than the resume window and keeps newer ones', async () => {
      const server = await serve()
      try {
        const [oldOne, newOne] = await Promise.all([PNG, JPEG].map(async (body) => (await (await upload(server.url, body)).json()).data))
        const now = Date.now()
        const past = (now - RESUME_WINDOW_MS - 1000) / 1000
        await utimes(oldOne.path, past, past)
        expect(await pruneAttachments(now, dir)).toBe(1)
        expect(await readdir(dir)).toEqual([newOne.id])
      } finally { server.close() }
    })

    it('does nothing when the folder does not exist', async () => {
      expect(await pruneAttachments(Date.now(), dir)).toBe(0)
    })
  })
})
