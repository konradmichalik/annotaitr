import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, rm, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveVideoFile } from '../../../server/image/video.js'
import { config } from '../../../server/image/config.js'

describe('resolveVideoFile', () => {
  let dir

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-video-'))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns path, kind and MIME type for a video', async () => {
    const path = join(dir, 'clip.mp4')
    await writeFile(path, 'x')
    expect(await resolveVideoFile(path)).toEqual({ path, kind: 'video', mimeType: 'video/mp4' })
  })

  it('marks a GIF as its own kind', async () => {
    const path = join(dir, 'anim.gif')
    await writeFile(path, 'x')
    expect(await resolveVideoFile(path)).toMatchObject({ kind: 'gif', mimeType: 'image/gif' })
  })

  it('maps .mov to QuickTime', async () => {
    const path = join(dir, 'rec.MOV')
    await writeFile(path, 'x')
    expect((await resolveVideoFile(path)).mimeType).toBe('video/quicktime')
  })

  it('rejects an unsupported extension', async () => {
    await expect(resolveVideoFile(join(dir, 'a.mkv'))).rejects.toThrow(/Unsupported video format/)
  })

  it('rejects a missing file', async () => {
    await expect(resolveVideoFile(join(dir, 'missing.mp4'))).rejects.toThrow(/not found/)
  })

  it('rejects a GIF over the GIF size cap', async () => {
    const path = join(dir, 'big.gif')
    await writeFile(path, '')
    await truncate(path, config.maxGifBytes + 1)
    await expect(resolveVideoFile(path)).rejects.toThrow(/too large/)
  })
})
