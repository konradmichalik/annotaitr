import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve as resolvePath } from 'node:path'
import { changeState, collectChanges, compareInfo, fullFileDiff, gitPath, listCommits, repoRoot, resolveBase } from '../server/changes/git.js'
import { createChangesRouter } from '../server/changes/routes.js'
import { buildWalkthrough, hunksOnly, unchangedPaths } from '../server/changes/walkthrough.js'
import { parseArgs } from './args.js'
import { runMarkdown } from './markdown.js'

const CHANGES_USAGE = 'Usage: annotaitr changes [--base <ref>] [--explain <file>] [--origin <name>] [--feedback-notes <json|path>]'

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
  const groups = value.groups ?? []
  const validGroup = (g) => typeof g === 'object' && g !== null && typeof g.title === 'string' && g.title.trim() !== '' &&
    (g.why === undefined || typeof g.why === 'string') && Array.isArray(g.files) && g.files.every((f) => typeof f === 'string')
  if (!Array.isArray(groups) || !groups.every(validGroup)) {
    return { error: 'every group needs a "title" and a "files" list of paths' }
  }
  return {
    explanation: {
      ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, value[f]])),
      files,
      groups: groups.map((g) => ({ title: g.title, why: g.why, files: g.files }))
    }
  }
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

/** What the walkthrough compares and every changed file, as git sees them right now. */
async function compareWith(root, base) {
  const info = await compareInfo(root, base ? await resolveBase(root, base) : null)
  return info.uncommitted ? info : { ...info, commits: await listCommits(root, info.mergeBase) }
}

/** A hash of what the walkthrough shows, cheap enough to take again at the decision: no diff is read. */
async function fingerprint(root, base) {
  const compared = await compareWith(root, base)
  const state = await changeState(root, compared.mergeBase)
  return createHash('sha256').update(JSON.stringify({ mergeBase: compared.mergeBase, commits: compared.commits ?? [], state })).digest('hex')
}

/**
 * Writes the walkthrough into the git directory and returns its path, with
 * what decisionNote needs to check it at the decision, or `{ output }` when
 * there is nothing to review.
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
  let seen
  try {
    compared = await compareWith(root, base)
    seen = await fingerprint(root, base)
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

  try {
    const dir = await gitPath(root, 'annotaitr')
    await mkdir(dir, { recursive: true })
    const path = join(dir, 'changes.md')
    await writeFile(path, buildWalkthrough({ explanation: explained.explanation, compared, files }))
    const label = compared.uncommitted ? `${compared.branch} · uncommitted` : `${compared.branch} → ${compared.base}`
    return { path, root, base, label, compared, files, fingerprint: seen, unchangedPaths: unchangedPaths(explained.explanation, files) }
  } catch (err) {
    return { error: `Could not write the walkthrough: ${err.message}` }
  }
}

/**
 * What the agent must know besides the decision: the changes moved while the
 * reviewer looked at them, or its explanation named paths that are not part
 * of them. Empty when neither applies.
 */
export async function decisionNote({ root, base, fingerprint: seen, unchangedPaths }) {
  const notes = []
  try {
    if (await fingerprint(root, base) !== seen) {
      notes.push('CHANGED DURING REVIEW: the changes differ from what the reviewer saw. Present them again before you commit.')
    }
  } catch (err) {
    notes.push(`CHANGED DURING REVIEW: could not compare the changes again (${err.message}). Present them again before you commit.`)
  }
  if (unchangedPaths.length > 0) {
    notes.push(`NOTE: the explanation names paths that are not part of these changes: ${unchangedPaths.join(', ')}. Check the paths in explain.json.`)
  }
  return notes.length > 0 ? `${notes.join('\n')}\n\n` : ''
}

export async function runChanges(args) {
  const parsed = parseChangesArgs(args)
  if (parsed.help) { return { output: `${CHANGES_USAGE}\n` } }
  if (parsed.error) { return { error: `${parsed.error}\n${CHANGES_USAGE}` } }
  const prepared = await prepareWalkthrough(parsed)
  if (prepared.error || prepared.output) { return prepared }
  // The walkthrough holds code from the working tree, so it goes as soon as the reviewer has decided.
  // A failed removal must not cost the reviewer's decision.
  const removeWalkthrough = () => rm(prepared.path, { force: true }).catch(() => {})
  // Only the files of this walkthrough can be read in full, by their exact path.
  const byPath = new Map(prepared.files.map((f) => [f.path, f]))
  const wholeFiles = new Map()
  const fullDiff = async (path) => {
    const file = byPath.get(path)
    if (!file) { return null }
    if (!wholeFiles.has(path)) {
      const diff = await fullFileDiff(prepared.root, prepared.compared.mergeBase, file)
      wholeFiles.set(path, diff === null ? null : hunksOnly(diff))
    }
    return wholeFiles.get(path)
  }
  const onDecision = async () => {
    await removeWalkthrough()
    return decisionNote(prepared)
  }
  try {
    await runMarkdown({ targets: [prepared.path], origin: parsed.origin, feedbackNotes: parsed.feedbackNotes, kind: 'changes', label: prepared.label, routes: createChangesRouter(fullDiff), onDecision })
  } catch (err) {
    await removeWalkthrough()
    return { error: err.message }
  }
  return {}
}
