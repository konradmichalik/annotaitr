import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectChanges, compareInfo, gitPath, repoRoot, resolveBase } from '../../../server/changes/git.js'

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' }

function run(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' })
}

describe('changes git layer', () => {
  let dir

  beforeAll(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'annotaitr-changes-')))
    run(dir, 'init', '-q', '-b', 'main')
    await writeFile(join(dir, 'a.js'), 'one\ntwo\n')
    await writeFile(join(dir, 'gone.txt'), 'bye\n')
    await writeFile(join(dir, 'package-lock.json'), '{}\n')
    run(dir, 'add', '.')
    run(dir, 'commit', '-q', '-m', 'init')
    run(dir, 'switch', '-q', '-c', 'feature/x')
    await writeFile(join(dir, 'a.js'), 'one\nTWO\n')
    run(dir, 'rm', '-q', 'gone.txt')
    run(dir, 'commit', '-q', '-am', 'change')
    await writeFile(join(dir, 'package-lock.json'), '{"a":1}\n')
    await writeFile(join(dir, 'new.md'), '# New\n')
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('finds the default branch and the merge base', async () => {
    const root = await repoRoot(dir)
    const base = await resolveBase(root)
    expect(base.name).toBe('main')
    const info = await compareInfo(root, base)
    expect(info.branch).toBe('feature/x')
    expect(info.mergeBase).toBe(base.sha)
  })

  it('rejects a base that is not a commit, including one that looks like an option', async () => {
    await expect(resolveBase(dir, 'nope')).rejects.toThrow('Unknown base "nope"')
    await expect(resolveBase(dir, '--output=/tmp/x')).rejects.toThrow('Unknown base')
  })

  it('collects committed, uncommitted and untracked changes with real hunks', async () => {
    const base = await resolveBase(dir)
    const files = await collectChanges(dir, base.sha)
    expect(files.map((f) => [f.path, f.status])).toEqual([
      ['a.js', 'M'], ['gone.txt', 'D'], ['new.md', 'A'], ['package-lock.json', 'M']
    ])
    const a = files.find((f) => f.path === 'a.js')
    expect(a).toMatchObject({ added: 1, removed: 1, omitted: null })
    expect(a.diff).toContain('@@ -1,2 +1,2 @@\n one\n-two\n+TWO')
    expect(files.find((f) => f.path === 'new.md')).toMatchObject({ added: 1, removed: 0 })
    expect(files.find((f) => f.path === 'new.md').diff).toContain('+# New')
  })

  it('names a lock file instead of showing its hunks', async () => {
    const base = await resolveBase(dir)
    const lock = (await collectChanges(dir, base.sha)).find((f) => f.path === 'package-lock.json')
    expect(lock).toMatchObject({ omitted: 'lock file', diff: null })
  })

  it('places the walkthrough inside the git directory', async () => {
    expect(await gitPath(dir, 'annotaitr')).toBe(join(dir, '.git', 'annotaitr'))
  })
})
