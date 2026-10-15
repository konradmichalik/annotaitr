import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeCrops } from '../../../../server/image/common/cropFiles.js'

describe('writeCrops', () => {
  let dir

  afterEach(async () => {
    vi.restoreAllMocks()
    if (dir) { await rm(dir, { recursive: true, force: true }) }
  })

  it('maps every number of a crop to its file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-crops-'))
    const byNumber = await writeCrops(dir, 'page-02-', [{ numbers: [1, 2], buffer: Buffer.from('a') }, { numbers: [3], buffer: Buffer.from('b') }])
    expect([...byNumber]).toEqual([
      [1, join(dir, 'page-02-crop-01-02.png')], [2, join(dir, 'page-02-crop-01-02.png')], [3, join(dir, 'page-02-crop-03.png')]
    ])
  })

  it('falls back to no crops and removes the ones written when a write fails', async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-crops-'))
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const byNumber = await writeCrops(dir, '', [{ numbers: [1], buffer: Buffer.from('a') }, { numbers: [2], buffer: 42 }])
    expect(byNumber).toEqual(new Map())
    expect(await readdir(dir)).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/^annotaitr: could not write the crops per note, the feedback goes without them \(.+\)\n$/)
  })
})
