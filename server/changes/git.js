import { execFile } from 'node:child_process'
import { basename, resolve } from 'node:path'

// Repository config can run programs from a diff (external diff, textconv,
// fsmonitor). None of it is needed to read changes, so it is switched off.
const SAFE_CONFIG = ['-c', 'core.fsmonitor=false', '-c', 'core.quotepath=false', '-c', 'diff.external=']
const DIFF_FLAGS = ['--no-ext-diff', '--no-textconv', '--no-renames', '--no-color']
const MAX_BUFFER = 64 * 1024 * 1024
const TIMEOUT_MS = 20_000
const MAX_FILE_LINES = 1000

const LOCK_FILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock',
  'composer.lock', 'Cargo.lock', 'poetry.lock', 'uv.lock', 'Gemfile.lock', 'go.sum'
])

/** Run git without a shell. `okCodes` lists exit codes that are not errors (`diff --no-index` exits 1 on a difference). */
export function git(args, { cwd, okCodes = [0] }) {
  return new Promise((resolvePromise, reject) => {
    execFile('git', [...SAFE_CONFIG, ...args], { cwd, maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS }, (err, stdout, stderr) => {
      const code = err ? err.code : 0
      if (err && !okCodes.includes(code)) {
        reject(new Error((stderr || err.message).trim()))
        return
      }
      resolvePromise(stdout)
    })
  })
}

export async function repoRoot(cwd) {
  return (await git(['rev-parse', '--show-toplevel'], { cwd })).trim()
}

async function commitOf(root, ref) {
  try {
    return (await git(['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`], { cwd: root })).trim()
  } catch {
    return null
  }
}

/** The commit a `--base` ref names. */
export async function resolveBase(root, ref) {
  const sha = await commitOf(root, ref)
  if (!sha) { throw new Error(`Unknown base "${ref}": not a commit, branch or tag in this repository`) }
  return { name: ref, sha }
}

/**
 * What the walkthrough compares: the uncommitted changes against HEAD, or with
 * a base the whole branch against its merge base with that base.
 */
export async function compareInfo(root, base) {
  const head = await commitOf(root, 'HEAD')
  if (!head) { throw new Error('No commit yet: nothing to compare the changes against') }
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root })).trim()
  const branchName = branch === 'HEAD' ? head.slice(0, 7) : branch
  if (!base) {
    return { branch: branchName, base: 'HEAD', mergeBase: head, uncommitted: true }
  }
  const mergeBase = (await git(['merge-base', 'HEAD', base.sha], { cwd: root })).trim()
  return { branch: branchName, base: base.name, mergeBase, uncommitted: false }
}

/** The commits between the merge base and HEAD, oldest first, as short sha and subject. */
export async function listCommits(root, mergeBase) {
  const output = await git(['log', '--no-color', '--reverse', '--format=%h%x1f%s%x1e', '--end-of-options', `${mergeBase}..HEAD`], { cwd: root })
  return output.split('\x1e').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [sha, subject] = entry.split('\x1f')
    return { sha, subject }
  })
}

function splitZ(output) {
  return output.split('\0').filter(Boolean)
}

function parseNumstat(output) {
  const counts = new Map()
  for (const entry of splitZ(output)) {
    const [added, removed, path] = entry.split('\t')
    counts.set(path, { added: Number(added) || 0, removed: Number(removed) || 0, binary: added === '-' })
  }
  return counts
}

function parseNameStatus(output) {
  const parts = splitZ(output)
  const statuses = new Map()
  for (let i = 0; i + 1 < parts.length; i += 2) {
    statuses.set(parts[i + 1], parts[i][0])
  }
  return statuses
}

function omission(path, { added, removed, binary }) {
  if (binary) { return 'binary file' }
  if (LOCK_FILES.has(basename(path))) { return 'lock file' }
  if (added + removed > MAX_FILE_LINES) { return `more than ${MAX_FILE_LINES} changed lines` }
  return null
}

async function trackedChanges(root, mergeBase) {
  const range = ['--end-of-options', mergeBase, '--']
  const counts = parseNumstat(await git(['diff', ...DIFF_FLAGS, '--numstat', '-z', ...range], { cwd: root }))
  const statuses = parseNameStatus(await git(['diff', ...DIFF_FLAGS, '--name-status', '-z', ...range], { cwd: root }))
  return Promise.all([...statuses].map(async ([path, status]) => {
    const count = counts.get(path) ?? { added: 0, removed: 0, binary: false }
    const omitted = omission(path, count)
    const diff = omitted ? null : await git(['diff', ...DIFF_FLAGS, '--end-of-options', mergeBase, '--', path], { cwd: root })
    return { path, status, added: count.added, removed: count.removed, diff, omitted }
  }))
}

async function untrackedChanges(root) {
  const paths = splitZ(await git(['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }))
  return Promise.all(paths.map(async (path) => {
    const noIndex = ['diff', ...DIFF_FLAGS, '--no-index']
    const target = ['--', '/dev/null', path]
    const numstat = await git([...noIndex, '--numstat', '-z', ...target], { cwd: root, okCodes: [0, 1] })
    const stats = [...parseNumstat(numstat).values()][0] ?? { added: 0, removed: 0, binary: false }
    const omitted = omission(path, stats)
    const diff = omitted ? null : await git([...noIndex, ...target], { cwd: root, okCodes: [0, 1] })
    return { path, status: 'A', added: stats.added, removed: stats.removed, diff, omitted }
  }))
}

/** Every change against the merge base, working tree and untracked files included, sorted by path. */
export async function collectChanges(root, mergeBase) {
  const files = [...await trackedChanges(root, mergeBase), ...await untrackedChanges(root)]
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

/** A path inside the git directory, which is never committed and never part of the diff. */
export async function gitPath(root, name) {
  return resolve(root, (await git(['rev-parse', '--git-path', name], { cwd: root })).trim())
}
