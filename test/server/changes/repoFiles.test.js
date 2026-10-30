import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listRepoFiles, readRepoFile, repoRoot } from '../../../server/changes/git.js'

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' }
const run = (dir, ...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' })

describe('the files of a repository', () => {
  let dir
  let outside
  let root

  beforeAll(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'annotaitr-repo-files-')))
    run(dir, 'init', '-q', '-b', 'main')
    await mkdir(join(dir, 'src'))
    await writeFile(join(dir, 'src', 'Cache.php'), '<?php\nclass Cache {}\n')
    await writeFile(join(dir, 'README.md'), '# Readme\n')
    await writeFile(join(dir, 'package-lock.json'), '{}\n')
    await writeFile(join(dir, '.env.local'), 'TOKEN=abc\n')
    await writeFile(join(dir, 'gone.txt'), 'bye\n')
    await mkdir(join(dir, 'linkdir'))
    await writeFile(join(dir, 'linkdir', 'x.txt'), 'inside\n')
    await writeFile(join(dir, '.gitignore'), 'ignored.txt\n')
    run(dir, 'add', '.')
    run(dir, 'commit', '-q', '-m', 'init')
    await unlink(join(dir, 'gone.txt'))
    await writeFile(join(dir, 'new.md'), '# New\n')
    await writeFile(join(dir, '.env.example'), 'TOKEN=\n')
    await writeFile(join(dir, 'ignored.txt'), 'nope\n')
    await writeFile(join(dir, 'image.bin'), Buffer.from([0x89, 0x00, 0x01, 0x02]))
    await writeFile(join(dir, 'big.txt'), 'x'.repeat(300 * 1024))
    await symlink('/etc/hosts', join(dir, 'link.txt'))
    // The directory git knows is replaced by a link to somewhere else.
    outside = await realpath(await mkdtemp(join(tmpdir(), 'annotaitr-repo-outside-')))
    await writeFile(join(outside, 'x.txt'), 'outside secret\n')
    await rm(join(dir, 'linkdir'), { recursive: true })
    await symlink(outside, join(dir, 'linkdir'))
    root = await repoRoot(dir)
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })

  describe('listRepoFiles', () => {
    it('lists tracked and untracked files in path order, without ignored ones and without .git', async () => {
      const { files } = await listRepoFiles(root)
      const paths = files.map((f) => f.path)
      expect(paths).toEqual([...paths].sort())
      expect(paths).toEqual(expect.arrayContaining(['src/Cache.php', 'README.md', 'new.md', '.env.example']))
      expect(paths).not.toContain('ignored.txt')
      expect(paths.some((p) => p.startsWith('.git/'))).toBe(false)
    })

    it('says why a file will not be read, by its name', async () => {
      const { files } = await listRepoFiles(root)
      const omitted = Object.fromEntries(files.map((f) => [f.path, f.omitted]))
      expect(omitted['package-lock.json']).toBe('lock file')
      expect(omitted['.env.local']).toBe('possible secret')
      expect(omitted['.env.example']).toBeNull()
      expect(omitted['src/Cache.php']).toBeNull()
    })

    it('stops at the limit and says so', async () => {
      const listed = await listRepoFiles(root, { limit: 2 })
      expect(listed.files).toHaveLength(2)
      expect(listed.truncated).toBe(true)
      expect((await listRepoFiles(root)).truncated).toBe(false)
    })
  })

  describe('readRepoFile', () => {
    it('returns the content of a listed file', async () => {
      expect(await readRepoFile(root, 'src/Cache.php')).toEqual({ path: 'src/Cache.php', content: '<?php\nclass Cache {}\n' })
      expect(await readRepoFile(root, 'new.md')).toEqual({ path: 'new.md', content: '# New\n' })
    })

    it('answers null for a path that is not listed', async () => {
      for (const path of ['ignored.txt', 'nope.txt', '../outside.txt', '.git/config', '/etc/hosts', 'src', '', '*.md', 'src/*', ':(top)README.md']) {
        expect(await readRepoFile(root, path)).toBeNull()
      }
    })

    it('names the reason for a file git still lists that is gone from the disk', async () => {
      expect(await readRepoFile(root, 'gone.txt')).toEqual({ path: 'gone.txt', omitted: 'deleted in the working tree' })
    })

    it('names the reason instead of giving the content of a file it will not read', async () => {
      expect(await readRepoFile(root, '.env.local')).toEqual({ path: '.env.local', omitted: 'possible secret' })
      expect(await readRepoFile(root, 'package-lock.json')).toEqual({ path: 'package-lock.json', omitted: 'lock file' })
      expect(await readRepoFile(root, 'image.bin')).toEqual({ path: 'image.bin', omitted: 'binary file' })
      expect(await readRepoFile(root, 'big.txt')).toEqual({ path: 'big.txt', omitted: 'larger than 256 KB' })
    })

    it('does not follow a symbolic link out of the repository', async () => {
      expect(await readRepoFile(root, 'link.txt')).toEqual({ path: 'link.txt', omitted: 'symbolic link' })
    })

    it('does not follow a directory that was replaced by a link out of the repository', async () => {
      const result = await readRepoFile(root, 'linkdir/x.txt')
      expect(result).toEqual({ path: 'linkdir/x.txt', omitted: 'outside the repository' })
      expect(JSON.stringify(result)).not.toContain('outside secret')
    })

    it('shows a template of a secret file', async () => {
      expect(await readRepoFile(root, '.env.example')).toEqual({ path: '.env.example', content: 'TOKEN=\n' })
    })
  })
})
