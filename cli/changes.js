import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'
import { collectChanges, compareInfo, gitPath, repoRoot, resolveBase } from '../server/changes/git.js'
import { buildWalkthrough } from '../server/changes/walkthrough.js'
import { parseArgs } from './args.js'
import { runMarkdown } from './markdown.js'

export const CHANGES_USAGE = 'Usage: annotaitr changes [--base <ref>] [--explain <file>] [--origin <name>] [--feedback-notes <json|path>]'

const OWN_OPTIONS = { '--base': 'base', '--explain': 'explain' }
const TEXT_FIELDS = ['title', 'summary', 'commit']

/** `--base` and `--explain` are read here, everything else goes through the shared parser. */
export function parseChangesArgs(args) {
  const own = {}
  const rest = []
  for (let i = 0; i < args.length; i++) {
    const key = OWN_OPTIONS[args[i]]
    if (!key) { rest.push(args[i]); continue }
    if (args[i + 1] === undefined || args[i + 1].startsWith('--')) { return { error: `${args[i]} requires a value` } }
    own[key] = args[i + 1]
    i++
  }
  const shared = parseArgs(['node', 'annotaitr', ...rest])
  if (shared.error) { return { error: shared.error } }
  if (shared.help) { return { help: true } }
  if (shared.targets.length > 0) { return { error: `Unexpected argument: ${shared.targets[0]}` } }
  return { base: own.base ?? null, explain: own.explain ?? null, origin: shared.origin, feedbackNotes: shared.feedbackNotes }
}

/** The agent's explanation: optional title, summary and commit message, and one line per changed path. */
export function validateExplanation(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: 'the explanation must be a JSON object' }
  }
  for (const field of TEXT_FIELDS) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      return { error: `"${field}" must be a string` }
    }
  }
  const files = value.files ?? {}
  if (typeof files !== 'object' || files === null || Array.isArray(files) ||
      Object.values(files).some((line) => typeof line !== 'string')) {
    return { error: '"files" must map each path to one line of text' }
  }
  return { explanation: { ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, value[f]])), files } }
}

async function readExplanation(path) {
  let parsed
  try {
    parsed = JSON.parse(await readFile(resolvePath(path), 'utf-8'))
  } catch (err) {
    return { error: `--explain: ${err.message}` }
  }
  const result = validateExplanation(parsed)
  return result.error ? { error: `--explain: ${result.error}` } : result
}

/**
 * Writes the walkthrough into the git directory and returns its path, or
 * `{ output }` when there is nothing to review.
 */
export async function prepareWalkthrough({ base, explain, cwd = process.cwd() }) {
  let root
  try {
    root = await repoRoot(cwd)
  } catch {
    return { error: 'Not inside a git repository' }
  }
  const explained = explain ? await readExplanation(explain) : { explanation: {} }
  if (explained.error) { return { error: explained.error } }

  let compared
  let files
  try {
    compared = await compareInfo(root, base ? await resolveBase(root, base) : null)
    files = await collectChanges(root, compared.mergeBase)
  } catch (err) {
    return { error: err.message }
  }
  if (files.length === 0) {
    const against = compared.uncommitted
      ? `nothing uncommitted on ${compared.branch}`
      : `nothing differs from ${compared.base} (merge base ${compared.mergeBase.slice(0, 7)})`
    return { output: `NO CHANGES: ${against}.\n` }
  }

  const dir = await gitPath(root, 'annotaitr')
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'changes.md')
  await writeFile(path, buildWalkthrough({ explanation: explained.explanation, compared, files }))
  return { path }
}

export async function runChanges(args) {
  const parsed = parseChangesArgs(args)
  if (parsed.help) { return { output: `${CHANGES_USAGE}\n` } }
  if (parsed.error) { return { error: `${parsed.error}\n${CHANGES_USAGE}` } }
  const prepared = await prepareWalkthrough(parsed)
  if (prepared.error || prepared.output) { return prepared }
  await runMarkdown({ targets: [prepared.path], origin: parsed.origin, feedbackNotes: parsed.feedbackNotes, kind: 'changes' })
  return {}
}
