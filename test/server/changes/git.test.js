import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectChanges, compareInfo, gitPath, listCommits, repoRoot, resolveBase } from '../../../server/changes/git.js'

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

  it('compares the uncommitted changes against HEAD without a base', async () => {
    const root = await repoRoot(dir)
    const info = await compareInfo(root, null)
    expect(info).toMatchObject({ branch: 'feature/x', base: 'HEAD', uncommitted: true })
    expect(info.mergeBase).toBe(run(dir, 'rev-parse', 'HEAD').trim())
    const files = await collectChanges(root, info.mergeBase)
    expect(files.map((f) => f.path)).toEqual(['new.md', 'package-lock.json'])
  })

  it('compares the whole branch against its merge base with a base', async () => {
    const root = await repoRoot(dir)
    const base = await resolveBase(root, 'main')
    const info = await compareInfo(root, base)
    expect(info).toMatchObject({ branch: 'feature/x', base: 'main', mergeBase: base.sha, uncommitted: false })
  })

  it('lists the commits since the merge base, oldest first', async () => {
    const base = await resolveBase(dir, 'main')
    const commits = await listCommits(dir, base.sha)
    expect(commits.map((c) => c.subject)).toEqual(['change'])
    expect(commits[0].sha).toMatch(/^[0-9a-f]{7,}$/)
  })

  it('rejects a base that is not a commit, including one that looks like an option', async () => {
    await expect(resolveBase(dir, 'nope')).rejects.toThrow('Unknown base "nope"')
    await expect(resolveBase(dir, '--output=/tmp/x')).rejects.toThrow('Unknown base')
  })

  it('collects committed, uncommitted and untracked changes with real hunks', async () => {
    const base = await resolveBase(dir, 'main')
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
    const base = await resolveBase(dir, 'main')
    const lock = (await collectChanges(dir, base.sha)).find((f) => f.path === 'package-lock.json')
    expect(lock).toMatchObject({ omitted: 'lock file', diff: null })
  })

  it('leaves out untracked files that look like secrets', async () => {
    await writeFile(join(dir, '.env.local'), 'TOKEN=x\n')
    await writeFile(join(dir, 'deploy.pem'), 'key\n')
    await writeFile(join(dir, '.env.example'), 'TOKEN=\n')
    const files = await collectChanges(dir, (await resolveBase(dir, 'main')).sha)
    expect(files.find((f) => f.path === '.env.local')).toMatchObject({ omitted: 'possible secret', diff: null })
    expect(files.find((f) => f.path === 'deploy.pem')).toMatchObject({ omitted: 'possible secret', diff: null })
    expect(files.find((f) => f.path === '.env.example').diff).toContain('+TOKEN=')
    await Promise.all(['.env.local', 'deploy.pem', '.env.example'].map((name) => rm(join(dir, name))))
  })

  it('names a file over the size limit instead of reading it', async () => {
    await writeFile(join(dir, 'big.min.js'), 'x'.repeat(300 * 1024))
    const files = await collectChanges(dir, (await resolveBase(dir, 'main')).sha)
    expect(files.find((f) => f.path === 'big.min.js')).toMatchObject({ omitted: 'larger than 256 KB', diff: null })
    await rm(join(dir, 'big.min.js'))
  })

  it('stops showing hunks past the file count and the size budget', async () => {
    const sha = (await resolveBase(dir, 'main')).sha
    const capped = await collectChanges(dir, sha, { maxFiles: 2 })
    expect(capped.slice(2).every((f) => f.omitted === 'over the limit of 2 files' && f.diff === null)).toBe(true)
    const budgeted = await collectChanges(dir, sha, { budget: 10 })
    expect(budgeted.filter((f) => f.diff !== null)).toHaveLength(1)
    expect(budgeted.find((f) => f.omitted === 'walkthrough size limit reached')).toBeDefined()
  })

  it('places the walkthrough inside the git directory', async () => {
    expect(await gitPath(dir, 'annotaitr')).toBe(join(dir, '.git', 'annotaitr'))
  })
})
