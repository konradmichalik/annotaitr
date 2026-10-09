import { execFile } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

// Repository config can run programs while git reads changes: an external
// diff, textconv, fsmonitor, a signature check in git log. Those are switched
// off. Clean filters from .gitattributes still run for files that changed in
// the working tree, exactly as they do for `git status`.
const SAFE_CONFIG = ['-c', 'core.fsmonitor=false', '-c', 'core.quotepath=false', '-c', 'diff.external=', '-c', 'log.showSignature=false']
const DIFF_FLAGS = ['--no-ext-diff', '--no-textconv', '--no-renames', '--no-color']
const MAX_BUFFER = 64 * 1024 * 1024
const TIMEOUT_MS = 20_000
const MAX_FILE_LINES = 1000
const MAX_FILE_BYTES = 256 * 1024
const CONCURRENCY = 8

// The walkthrough must stay under the markdown server's 2 MB file limit, with room for the text around the hunks.
export const DEFAULT_LIMITS = { maxFiles: 500, budget: 1.5 * 1024 * 1024 }

// Untracked files with these names often hold credentials; templates such as `.env.example` stay visible.
const SECRET_NAME = /^(\.env(\..+)?|\.npmrc|\.netrc|auth\.json|id_(rsa|dsa|ecdsa|ed25519)(\..+)?|.*\.(pem|key|p12|pfx|kdbx)|.*credentials.*)$/i
const TEMPLATE_NAME = /\.(example|sample|dist|template)$/i

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

function looksLikeSecret(path) {
  const name = basename(path)
  return SECRET_NAME.test(name) && !TEMPLATE_NAME.test(name)
}

/** Why a file in the working tree is not read: it is too large. Null when it can be read. */
async function fileOmission(root, path) {
  try {
    const stats = await lstat(join(root, path))
    return stats.isFile() && stats.size > MAX_FILE_BYTES ? `larger than ${MAX_FILE_BYTES / 1024} KB` : null
  } catch {
    return null
  }
}

/** Run `fn` over `items`, at most `limit` at a time, keeping the order of the results. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function trackedEntries(root, mergeBase) {
  const range = ['--end-of-options', mergeBase, '--']
  const counts = parseNumstat(await git(['diff', ...DIFF_FLAGS, '--numstat', '-z', ...range], { cwd: root }))
  const statuses = parseNameStatus(await git(['diff', ...DIFF_FLAGS, '--name-status', '-z', ...range], { cwd: root }))
  return [...statuses].map(([path, status]) => ({ path, status, tracked: true, ...(counts.get(path) ?? { added: 0, removed: 0, binary: false }) }))
}

async function untrackedEntries(root) {
  const paths = splitZ(await git(['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }))
  return paths.map((path) => ({ path, status: 'A', tracked: false, added: 0, removed: 0, binary: false }))
}

async function readEntry(root, mergeBase, entry, budget) {
  const result = (omitted, diff = null) => ({
    path: entry.path, status: entry.status, added: entry.added, removed: entry.removed, diff, omitted, untracked: !entry.tracked
  })
  if (!entry.tracked && looksLikeSecret(entry.path)) { return result('possible secret') }
  if (entry.status !== 'D') {
    const reason = await fileOmission(root, entry.path)
    if (reason) { return result(reason) }
  }
  if (entry.tracked) {
    const reason = omission(entry.path, entry)
    if (reason || budget.used >= budget.limit) { return result(reason ?? 'walkthrough size limit reached') }
    const diff = await git(['diff', ...DIFF_FLAGS, '--end-of-options', mergeBase, '--', entry.path], { cwd: root })
    budget.used += diff.length
    return result(null, diff)
  }
  const noIndex = ['diff', ...DIFF_FLAGS, '--no-index']
  const target = ['--', '/dev/null', entry.path]
  const counted = [...parseNumstat(await git([...noIndex, '--numstat', '-z', ...target], { cwd: root, okCodes: [0, 1] })).values()][0]
  const withCounts = { ...entry, ...counted }
  const reason = omission(entry.path, withCounts)
  if (reason || budget.used >= budget.limit) {
    return { ...result(reason ?? 'walkthrough size limit reached'), added: withCounts.added, removed: withCounts.removed }
  }
  const diff = await git([...noIndex, ...target], { cwd: root, okCodes: [0, 1] })
  budget.used += diff.length
  return { ...result(null, diff), added: withCounts.added, removed: withCounts.removed }
}

/** Keep hunks in path order until the budget is spent; a parallel read may have gone past it. */
function trimToBudget(files, limit) {
  let used = 0
  return files.map((file) => {
    if (file.diff === null) { return file }
    if (used >= limit) { return { ...file, diff: null, omitted: 'walkthrough size limit reached' } }
    used += file.diff.length
    return file
  })
}

/**
 * Every change against the merge base, working tree and untracked files
 * included, sorted by path. Beyond `maxFiles` files and once the hunks reach
 * `budget` bytes, files are listed with their counts but without hunks.
 */
export async function collectChanges(root, mergeBase, limits = DEFAULT_LIMITS) {
  const { maxFiles, budget } = { ...DEFAULT_LIMITS, ...limits }
  const entries = [...await trackedEntries(root, mergeBase), ...await untrackedEntries(root)]
    .sort((a, b) => a.path.localeCompare(b.path))
  const shown = entries.slice(0, maxFiles)
  const beyond = entries.slice(maxFiles).map((e) => ({
    path: e.path, status: e.status, added: e.added, removed: e.removed, diff: null, omitted: `over the limit of ${maxFiles} files`
  }))
  const spent = { used: 0, limit: budget }
  const read = await mapLimit(shown, CONCURRENCY, (entry) => readEntry(root, mergeBase, entry, spent))
  return [...trimToBudget(read, budget), ...beyond]
}

// More context lines than any file within the size limit has, so a hunk spans the whole file.
const WHOLE_FILE_CONTEXT = '-U100000'

/**
 * A changed file's diff with the whole file as context, for the reviewer who
 * wants to see more than the hunks. Null for a file whose hunks are not shown.
 * An untracked file's diff already holds all of it.
 */
export async function fullFileDiff(root, mergeBase, file) {
  if (file.diff === null || file.omitted) { return null }
  if (file.untracked) { return file.diff }
  return git(['diff', ...DIFF_FLAGS, WHOLE_FILE_CONTEXT, '--end-of-options', mergeBase, '--', file.path], { cwd: root })
}

/** A path inside the git directory, which is never committed and never part of the diff. */
export async function gitPath(root, name) {
  return resolve(root, (await git(['rev-parse', '--git-path', name], { cwd: root })).trim())
}
