import { resolve as resolvePath } from 'node:path'
import { openBrowser } from '../server/core/browser.js'
import { withLifecycle } from '../server/core/lifecycle.js'
import { isAnnotatableFile, supportedExtensions as markdownExtensions } from '../server/markdown/file.js'
import { buildMarkdownServer } from '../server/markdown/adapter.js'
import { formatApprovalOutput as formatMarkdownApproval } from '../server/markdown/feedback.js'
import { fileExists } from './detect.js'
import { fail } from './help.js'
import { handleOutcome } from './outcome.js'

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

export async function runMarkdown({ targets, origin, feedbackNotes, kind, onDecision = null }) {
  if (targets.length === 0) {
    fail('No file specified.')
    return
  }

  const { absolutePaths, error } = await resolveMarkdownTargets(targets)
  if (error) { fail(error); return }

  const server = withLifecycle(await buildMarkdownServer({ filePaths: absolutePaths, origin, feedbackNotes, kind }))
  process.stderr.write(`Server running at ${server.url}\n`)
  process.stderr.write(`Annotating: ${absolutePaths.join(', ')}\n`)
  await openBrowser(server.url)

  const decision = await server.waitForDecision()
  // A mode may put a note in front of the decision, such as a warning that the reviewed changes moved.
  const note = (await onDecision?.()) ?? ''
  await handleOutcome(server, decision, () => note + (
    decision.approved
      ? formatMarkdownApproval(decision)
      : decision.feedback + '\n'
  ))
}
