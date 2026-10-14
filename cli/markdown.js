import { relative, resolve as resolvePath } from 'node:path'
import { openBrowser } from '../server/core/browser.js'
import { withLifecycle } from '../server/core/lifecycle.js'
import { isAnnotatableFile, supportedExtensions as markdownExtensions } from '../server/markdown/file.js'
import { buildMarkdownServer } from '../server/markdown/adapter.js'
import { formatApprovalOutput as formatMarkdownApproval } from '../server/markdown/feedback.js'
import { formatMarkdownReplies } from '../server/markdown/repliesSection.js'
import { fileExists } from './detect.js'
import { fail } from './help.js'
import { handleOutcome, composeOutput } from './outcome.js'
import { openSession, recordSession } from './session.js'

async function resolveMarkdownTargets(targets) {
  const absolutePaths = []
  for (const fp of targets) {
    const abs = resolvePath(fp)
    if (!isAnnotatableFile(abs)) {
      return { error: `Unsupported file type: ${fp}\nSupported: ${markdownExtensions().join(', ')}` }
    }
    if (!(await fileExists(abs))) {
      return { error: `File not found: ${abs}` }
    }
    absolutePaths.push(abs)
  }
  return { absolutePaths }
}

/** One session per set of files, whatever order they are named in, and apart from an image at the same path. */
export function markdownSessionIdentity(absolutePaths) {
  return ['markdown', ...[...absolutePaths].sort()].join('\n')
}

/**
 * The session's target with the reviewed files. A document keeps its content
 * so the next round can compare with it; a changes walkthrough holds code from
 * the working tree and keeps only its hash.
 */
export function markdownSessionTarget(target, files) {
  const keep = target.kind === 'changes'
    ? ({ absolutePath, contentHash }) => ({ path: absolutePath, contentHash })
    : ({ absolutePath, contentHash, content }) => ({ path: absolutePath, contentHash, content })
  return { ...target, files: files.map(keep) }
}

function verdict(decision) {
  if (decision.repliesOnly) { return '' }
  return decision.approved ? formatMarkdownApproval(decision) : decision.feedback + '\n'
}

async function sessionOutput(opened, decision) {
  const line = await recordSession({ ...opened, target: markdownSessionTarget(opened.target, decision.files ?? []) }, decision, {
    extra: (annotation) => decision.threadFields?.[annotation.id] ?? {},
    noun: 'note'
  })
  const format = (carried, round) => formatMarkdownReplies(carried, round, { places: decision.places ?? {}, kind: opened.target.kind })
  return composeOutput({ ...decision, output: verdict(decision) }, opened, line, format, 'note')
}

/**
 * Serve markdown files until the reviewer decides and print the decision.
 * `opened` is a review session a caller opened already (a changes walkthrough),
 * else one is opened for the files with the `session` flags.
 */
export async function runMarkdown({
  targets, origin, feedbackNotes, kind, label = null, routes = null, onDecision = null, session = {}, opened: given = null
}) {
  if (targets.length === 0) {
    fail('No file specified.')
    return
  }

  const { absolutePaths, error } = await resolveMarkdownTargets(targets)
  if (error) { fail(error); return }

  const opened = given ?? await openSession({
    identity: markdownSessionIdentity(absolutePaths),
    target: { kind: 'markdown', label: absolutePaths.map((p) => relative(process.cwd(), p) || p).join(', ') },
    ...session
  })
  if (opened.error) { fail(opened.error); return }

  const server = withLifecycle(await buildMarkdownServer({ filePaths: absolutePaths, origin, feedbackNotes, kind, label, routes, session: opened }))
  process.stderr.write(`Server running at ${server.url}\n`)
  process.stderr.write(`Annotating: ${absolutePaths.join(', ')}\n`)
  await openBrowser(server.url)

  const decision = await server.waitForDecision()
  // A mode may put a note in front of the decision, such as a warning that the reviewed changes moved.
  const note = (await onDecision?.()) ?? ''
  const decided = !decision.aborted && !decision.disconnected
  const output = decided ? await sessionOutput(opened, decision) : ''
  await handleOutcome(server, decision, () => note + output)
}
