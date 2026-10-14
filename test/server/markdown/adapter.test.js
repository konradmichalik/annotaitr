import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { buildMarkdownServer } from '../../../server/markdown/adapter.js'
import { createChangesRouter } from '../../../server/changes/routes.js'

describe('buildMarkdownServer', () => {
  const oversizedPath = join(tmpdir(), `annotaitr-oversized-${process.pid}.md`)
  const readablePath = join(tmpdir(), `annotaitr-ok-${process.pid}.md`)
  let server

  afterEach(async () => {
    server?.stop()
    server = null
    await rm(oversizedPath, { force: true })
    await rm(readablePath, { force: true })
  })

  it('rejects startup when the initial file exceeds the size limit', async () => {
    await writeFile(oversizedPath, 'x'.repeat(2 * 1024 * 1024 + 1))
    await expect(
      buildMarkdownServer({ filePaths: [oversizedPath] })
    ).rejects.toThrow(/File too large/)
  })

  it('still starts normally for a readable file', async () => {
    await writeFile(readablePath, '# Hello')
    server = await buildMarkdownServer({ filePaths: [readablePath] })
    expect(server.port).toBeGreaterThan(0)
  })

  it('tells the client whether a file is a changes walkthrough', async () => {
    await writeFile(readablePath, '# Changes')
    server = await buildMarkdownServer({ filePaths: [readablePath], kind: 'changes' })
    const body = await (await fetch(`${server.url}/api/files`)).json()
    expect(body.data.files[0].kind).toBe('changes')
  })

  it('gives each file a stable id from its absolute path, without sending the path', async () => {
    await writeFile(readablePath, '# Hello')
    server = await buildMarkdownServer({ filePaths: [readablePath] })
    const expected = createHash('sha256').update(readablePath).digest('hex')
    const files = await (await fetch(`${server.url}/api/files`)).json()
    expect(files.data.files[0].fileId).toBe(expected)
    expect(JSON.stringify(files.data)).not.toContain(`"${readablePath}"`)
    const single = await (await fetch(`${server.url}/api/file`)).json()
    expect(single.data.fileId).toBe(expected)
  })

  it('gives a changes walkthrough no file id, since it is regenerated each run', async () => {
    await writeFile(readablePath, '# Changes')
    server = await buildMarkdownServer({ filePaths: [readablePath], kind: 'changes' })
    const body = await (await fetch(`${server.url}/api/files`)).json()
    expect(body.data.files[0].fileId).toBeNull()
  })

  it('serves no files next to a changes walkthrough', async () => {
    await writeFile(readablePath, '# Changes')
    server = await buildMarkdownServer({ filePaths: [readablePath], kind: 'changes' })
    const res = await fetch(`${server.url}/${readablePath.split('/').pop()}`)
    expect(res.status).toBe(404)
  })

  it('passes a label for the header and mounts extra routes', async () => {
    await writeFile(readablePath, '# Changes')
    const routes = createChangesRouter(async (path) => (path === 'a.js' ? '@@ -1 +1 @@\n-a\n+b' : null))
    server = await buildMarkdownServer({ filePaths: [readablePath], kind: 'changes', label: 'feature/x → main', routes })
    const files = await (await fetch(`${server.url}/api/files`)).json()
    expect(files.data.files[0].label).toBe('feature/x → main')
    const full = await (await fetch(`${server.url}/api/changes/full?path=a.js`)).json()
    expect(full.data.diff).toBe('@@ -1 +1 @@\n-a\n+b')
    expect((await fetch(`${server.url}/api/changes/full?path=..%2F..%2Fetc%2Fpasswd`)).status).toBe(404)
  })

  it('marks an ordinary file as a document', async () => {
    await writeFile(readablePath, '# Hello')
    server = await buildMarkdownServer({ filePaths: [readablePath] })
    const body = await (await fetch(`${server.url}/api/files`)).json()
    expect(body.data.files[0].kind).toBe('document')
  })
})
