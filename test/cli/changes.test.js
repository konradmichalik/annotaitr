import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseChangesArgs, prepareWalkthrough, validateExplanation } from '../../cli/changes.js'

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' }

describe('parseChangesArgs', () => {
  it('reads --base and --explain and passes the rest to the shared parser', () => {
    expect(parseChangesArgs(['--base', 'develop', '--explain', 'e.json', '--origin', 'claude-code'])).toMatchObject({
      base: 'develop', explain: 'e.json', origin: 'claude-code'
    })
  })

  it('rejects a missing value, a stray target and an unknown origin', () => {
    expect(parseChangesArgs(['--base']).error).toBe('--base requires a value')
    expect(parseChangesArgs(['README.md']).error).toBe('Unexpected argument: README.md')
    expect(parseChangesArgs(['--origin', 'nope']).error).toContain('Unknown origin "nope"')
  })
})

describe('validateExplanation', () => {
  it('keeps the known fields', () => {
    expect(validateExplanation({ title: 'T', commit: 'fix: x', files: { 'a.js': 'why' }, extra: 1 })).toEqual({
      explanation: { title: 'T', summary: undefined, commit: 'fix: x', files: { 'a.js': 'why' } }
    })
  })

  it('rejects wrong shapes with a message the agent can act on', () => {
    expect(validateExplanation([]).error).toBe('the explanation must be a JSON object')
    expect(validateExplanation({ title: 3 }).error).toBe('"title" must be a string')
    expect(validateExplanation({ files: { 'a.js': ['x'] } }).error).toBe('"files" must map each path to one line of text')
  })
})

describe('prepareWalkthrough', () => {
  let dir

  beforeAll(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'annotaitr-changes-cli-')))
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, env })
    await writeFile(join(dir, 'a.js'), 'one\n')
    execFileSync('git', ['add', '.'], { cwd: dir, env })
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir, env })
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('says so when nothing changed, without writing a walkthrough', async () => {
    expect(await prepareWalkthrough({ cwd: dir })).toEqual({ output: 'NO CHANGES: nothing uncommitted on main.\n' })
  })

  it('writes the walkthrough with the explanation into the git directory', async () => {
    await writeFile(join(dir, 'a.js'), 'two\n')
    await writeFile(join(dir, 'explain.json'), JSON.stringify({ title: 'Rename', files: { 'a.js': 'Says two.' } }))
    const { path } = await prepareWalkthrough({ cwd: dir, explain: join(dir, 'explain.json') })
    expect(path).toBe(join(dir, '.git', 'annotaitr', 'changes.md'))
    const md = await readFile(path, 'utf-8')
    expect(md).toContain('# Rename')
    expect(md).toContain('## a.js\n\nSays two.\n\n````diff a.js\n@@ -1 +1 @@\n-one\n+two\n````')
    expect(md).toContain('**Not explained:** `explain.json`')
  })

  it('compares the whole branch with --base', async () => {
    const { path } = await prepareWalkthrough({ cwd: dir, base: 'main' })
    expect(await readFile(path, 'utf-8')).toContain('against `main` (merge base')
  })

  it('reports an unknown base', async () => {
    expect((await prepareWalkthrough({ cwd: dir, base: 'nope' })).error).toContain('Unknown base "nope"')
  })

  it('reports a broken explanation file', async () => {
    await writeFile(join(dir, 'bad.json'), '{')
    expect((await prepareWalkthrough({ cwd: dir, explain: join(dir, 'bad.json') })).error).toMatch(/^--explain: /)
  })

  it('reports a directory outside a repository', async () => {
    expect((await prepareWalkthrough({ cwd: tmpdir() })).error).toBe('Not inside a git repository')
  })
})
