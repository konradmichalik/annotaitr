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
const MAX_DIFF_BYTES = 512 * 1024
const CONCURRENCY = 8

// The walkthrough must stay under the markdown server's 2 MB file limit, with
// room for the text around the hunks. Files are picked in path order, so the
// same changes always give the same walkthrough.
const LIMITS = { maxFiles: 500, maxLines: 20_000, budget: 1.5 * 1024 * 1024 }

// Untracked files with these names often hold credentials; templates such as `.env.example` stay visible.
const SECRET_NAME = /^(\.env(\..+)?|.*\.env|\.npmrc|\.netrc|\.pgpass|auth\.json|id_(rsa|dsa|ecdsa|ed25519)(\..+)?|.*\.(pem|key|p12|pfx|jks|keystore|kdbx)|secrets?\.(ya?ml|json)|service-account.*\.json|.*credentials.*)$/i
const TEMPLATE_NAME = /\.(example|sample|dist|template)$/i

const LOCK_FILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock',
  'composer.lock', 'Cargo.lock', 'poetry.lock', 'uv.lock', 'Gemfile.lock', 'go.sum'
])

/**
 * Run git without a shell. `okCodes` lists exit codes that are not errors
 * (`diff --no-index` exits 1 on a difference), `input` goes to its stdin.
 */
export function git(args, { cwd, okCodes = [0], input = null }) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile('git', [...SAFE_CONFIG, ...args], { cwd, maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS }, (err, stdout, stderr) => {
      const code = err ? err.code : 0
      if (err && !okCodes.includes(code)) {
        reject(new Error((stderr || err.message).trim()))
        return
      }
      resolvePromise(stdout)
    })
    if (input !== null) { child.stdin.end(input) }
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
  return [...statuses].map(([path, status]) => ({ path, status, untracked: false, ...(counts.get(path) ?? { added: 0, removed: 0, binary: false }) }))
}

async function untrackedPaths(root) {
  return splitZ(await git(['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }))
}

function diffArgs(mergeBase, entry, extra = []) {
  return entry.untracked
    ? ['diff', ...DIFF_FLAGS, ...extra, '--no-index', '--', '/dev/null', entry.path]
    : ['diff', ...DIFF_FLAGS, ...extra, '--end-of-options', mergeBase, '--', entry.path]
}

/** An entry with its line counts and, when its hunks will not be shown, why. Nothing is read yet. */
async function countEntry(root, mergeBase, entry) {
  if (entry.untracked && looksLikeSecret(entry.path)) { return { ...entry, omitted: 'possible secret' } }
  const tooLarge = entry.status === 'D' ? null : await fileOmission(root, entry.path)
  if (tooLarge) { return { ...entry, omitted: tooLarge } }
  const counted = entry.untracked
    ? { ...entry, ...[...parseNumstat(await git(diffArgs(mergeBase, entry, ['--numstat', '-z']), { cwd: root, okCodes: [0, 1] })).values()][0] }
    : entry
  return { ...counted, omitted: omission(entry.path, counted) }
}

/** Keep files in path order until `maxLines` changed lines are picked, before anything is read. */
function pickByLines(entries, maxLines) {
  let lines = 0
  return entries.map((entry) => {
    if (entry.omitted) { return entry }
    if (lines >= maxLines) { return { ...entry, omitted: 'walkthrough size limit reached' } }
    lines += entry.added + entry.removed
    return entry
  })
}

async function readEntry(root, mergeBase, entry) {
  const { path, status, added, removed, untracked } = entry
  if (entry.omitted) { return { path, status, added, removed, untracked, diff: null, omitted: entry.omitted } }
  const diff = await git(diffArgs(mergeBase, entry), { cwd: root, okCodes: [0, 1] })
  // A file under the size limit can still have a huge old version, a minified line for example.
  if (Buffer.byteLength(diff) > MAX_DIFF_BYTES) {
    return { path, status, added, removed, untracked, diff: null, omitted: `diff larger than ${MAX_DIFF_BYTES / 1024} KB` }
  }
  return { path, status, added, removed, untracked, diff, omitted: null }
}

/** Keep hunks in path order as long as they fit in `limit` bytes. */
function trimToBudget(files, limit) {
  let used = 0
  return files.map((file) => {
    if (file.diff === null) { return file }
    const bytes = Buffer.byteLength(file.diff)
    if (used + bytes > limit) { return { ...file, diff: null, omitted: 'walkthrough size limit reached' } }
    used += bytes
    return file
  })
}

/**
 * Every change against the merge base, working tree and untracked files
 * included, sorted by path. Beyond `maxFiles` files, `maxLines` changed lines
 * or `budget` bytes of hunks, files are listed with their counts but without
 * hunks. The limits are parameters for the tests; the defaults are LIMITS.
 */
export async function collectChanges(root, mergeBase, limits = {}) {
  const { maxFiles, maxLines, budget } = { ...LIMITS, ...limits }
  const untracked = (await untrackedPaths(root)).map((path) => ({ path, status: 'A', untracked: true, added: 0, removed: 0, binary: false }))
  const entries = [...await trackedEntries(root, mergeBase), ...untracked].sort((a, b) => a.path.localeCompare(b.path))
  const beyond = entries.slice(maxFiles).map(({ path, status, added, removed, untracked: u }) => ({
    path, status, added, removed, untracked: u, diff: null, omitted: `over the limit of ${maxFiles} files`
  }))
  const counted = await mapLimit(entries.slice(0, maxFiles), CONCURRENCY, (entry) => countEntry(root, mergeBase, entry))
  const read = await mapLimit(pickByLines(counted, maxLines), CONCURRENCY, (entry) => readEntry(root, mergeBase, entry))
  return [...trimToBudget(read, budget), ...beyond]
}

/**
 * What the changes are, cheaply: which files changed against the merge base,
 * the untracked ones, and the content hash of every changed file in the
 * working tree. It differs as soon as anything that a walkthrough shows moves.
 */
export async function changeState(root, mergeBase) {
  const range = ['--end-of-options', mergeBase, '--']
  const statuses = await git(['diff', ...DIFF_FLAGS, '--name-status', '-z', ...range], { cwd: root })
  const untracked = await untrackedPaths(root)
  const present = [...parseNameStatus(statuses)].filter(([, status]) => status !== 'D').map(([path]) => path)
  const paths = [...present, ...untracked]
  const hashes = paths.length > 0
    ? await git(['hash-object', '--stdin-paths'], { cwd: root, input: paths.join('\n') + '\n' })
    : ''
  return [statuses, untracked.join('\0'), hashes].join('\n')
}

// Context lines beyond any file within the size limit, so the one hunk spans the whole file.
const WHOLE_FILE_CONTEXT = ['-U1000000']

/**
 * A changed file's diff with the whole file as context, for the reviewer who
 * wants to see more than the hunks. Null for a file whose hunks are not shown,
 * or one that has grown past the limits since the walkthrough was written.
 * An untracked file's diff already holds all of it.
 */
export async function fullFileDiff(root, mergeBase, file) {
  if (file.diff === null || file.omitted) { return null }
  if (file.untracked) { return file.diff }
  if (file.status !== 'D' && await fileOmission(root, file.path)) { return null }
  const diff = await git(diffArgs(mergeBase, file, WHOLE_FILE_CONTEXT), { cwd: root })
  return Buffer.byteLength(diff) > 2 * MAX_DIFF_BYTES ? null : diff
}

/** A path inside the git directory, which is never committed and never part of the diff. */
export async function gitPath(root, name) {
  return resolve(root, (await git(['rev-parse', '--git-path', name], { cwd: root })).trim())
}
