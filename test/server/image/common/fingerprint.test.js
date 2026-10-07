import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { hashFile, hashBuffer, fingerprintInBackground } from '../../../../server/image/common/fingerprint.js'

describe('hashFile', () => {
  let dir
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'annotaitr-fp-')) })
  afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

  it('hashes the content, not the name', async () => {
    await writeFile(join(dir, 'a.png'), 'same')
    await writeFile(join(dir, 'b.png'), 'same')
    await writeFile(join(dir, 'c.png'), 'other')
    const a = await hashFile(join(dir, 'a.png'))
    expect(a).toBe(`sha256:${createHash('sha256').update('same').digest('hex')}`)
    expect(await hashFile(join(dir, 'b.png'))).toBe(a)
    expect(await hashFile(join(dir, 'c.png'))).not.toBe(a)
  })

  it('hashes in the background and settles on null when the file cannot be read, so a review never fails on it', async () => {
    await writeFile(join(dir, 'd.png'), 'same')
    expect(await fingerprintInBackground(join(dir, 'd.png'))).toBe(await hashFile(join(dir, 'a.png')))
    expect(await fingerprintInBackground(join(dir, 'missing.png'))).toBeNull()
  })

  it('hashes bytes already in memory the same way as the file they came from', async () => {
    expect(hashBuffer(Buffer.from('same'))).toBe(await hashFile(join(dir, 'a.png')))
    expect(hashBuffer(new Uint8Array(Buffer.from('same')))).toBe(await hashFile(join(dir, 'a.png')))
  })

  it('rejects for a missing file', async () => {
    await expect(hashFile(join(dir, 'nope.png'))).rejects.toThrow(/ENOENT/)
  })
})
