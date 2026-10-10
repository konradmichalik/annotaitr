#!/usr/bin/env node

import { resolve as resolvePath } from 'node:path'
import { realpathSync } from 'node:fs'
import { isOfficeDocument } from './server/image/common/fileTypes.js'
import { parseArgs, captureFlagError, VALID_MODES } from './cli/args.js'
import { detectMode, fileExists, isPdfTarget, rejoinSplitPath } from './cli/detect.js'
import { CHAT_IMAGE_HINT, fail, printHelpAndExit } from './cli/help.js'
import { convertHint } from './cli/document.js'
import { runImage, runBareInvocation } from './cli/image.js'
import { runMarkdown } from './cli/markdown.js'
import { runReply } from './cli/reply.js'
import { runChanges } from './cli/changes.js'

async function main() {
  // A subcommand, not a target: it must not reach the target parser, which rejects its flags.
  if (process.argv[2] === 'reply') {
    const { output, error } = await runReply(process.argv.slice(3))
    if (error) {
      process.stderr.write(`Error: ${error}\n`)
      process.exit(1)
      return
    }
    process.stdout.write(output)
    return
  }

  if (process.argv[2] === 'changes') {
    const { output, error } = await runChanges(process.argv.slice(3))
    if (error) {
      process.stderr.write(`Error: ${error}\n`)
      process.exit(1)
      return
    }
    if (output) { process.stdout.write(output) }
    return
  }

  const {
    help, targets: rawTargets, origin, viewportSpec, delaySpec, feedbackNotes, modeOverride, feedbackNotesFlagGiven,
    sourceSpec, pageRanges, sessionId, newSession, error
  } = parseArgs(process.argv)
  const session = { sessionId, newSession }

  if (error) { fail(error); return }
  if (help) { printHelpAndExit(0); return }
  const targets = await rejoinSplitPath(rawTargets)

  // A Claude Code chat image reaches us as the chip text, not a path. Exit 0
  // so the slash command still hands its instructions to the agent.
  if (targets.some((t) => t.startsWith('[Image'))) {
    process.stdout.write(CHAT_IMAGE_HINT)
    return
  }

  // Not a mode: nothing is opened, the agent gets told how to make a PDF.
  if (targets.length === 1 && isOfficeDocument(targets[0])) {
    if (!(await fileExists(resolvePath(targets[0])))) {
      fail(`File not found: ${resolvePath(targets[0])}`)
      return
    }
    process.stdout.write(await convertHint(targets[0]))
    return
  }

  const pdfTarget = targets.length === 1 && isPdfTarget(targets[0])
  for (const [flag, given] of [['--source', sourceSpec !== null], ['--pages', pageRanges !== null]]) {
    if (given && !pdfTarget) {
      fail(`${flag} only applies to a PDF target.`)
      return
    }
  }

  if (targets.length === 0 && !modeOverride) {
    await runBareInvocation({ origin, viewportSpec, session })
    return
  }

  let mode = modeOverride
  if (!mode) {
    const detected = await detectMode(targets)
    if (detected.error) { fail(detected.error); return }
    mode = detected.mode
  }

  const flagError = flagErrorForMode(mode, { viewportSpec, delaySpec, feedbackNotesFlagGiven, sessionId, newSession })
  if (flagError) { fail(flagError); return }

  if (mode === 'markdown') {
    await runMarkdown({ targets, origin, feedbackNotes })
  } else if (mode === 'image') {
    await runImage({ targets, origin, viewportSpec, delaySpec, sourceSpec, pageRanges, session })
  } else {
    fail(`Unknown mode "${mode}". Valid: ${VALID_MODES.join(', ')}`)
  }
}

/** The error for a flag that does not apply to the mode, or null. */
function flagErrorForMode(mode, { viewportSpec, delaySpec, feedbackNotesFlagGiven, sessionId, newSession }) {
  if (mode === 'markdown') {
    if (sessionId || newSession) { return '--session and --new-session only apply to image targets.' }
    return captureFlagError('markdown files', { viewportSpec, delaySpec })
  }
  if (mode === 'image' && feedbackNotesFlagGiven) { return '--feedback-notes only applies to markdown targets, not images.' }
  return null
}

// Only run main() when this file is executed directly (`node index.js` or
// the `annotaitr`/`md-annotator` bin). Importing it for tests must not
// trigger it. import.meta.url is resolved through symlinks, but a globally
// npm-installed bin is invoked through one (e.g. /opt/homebrew/bin/annotaitr
// -> .../lib/node_modules/annotaitr/index.js), so process.argv[1] needs the
// same resolution or this check never matches and the CLI silently no-ops.
let entryPath
try {
  entryPath = realpathSync(process.argv[1])
} catch {
  entryPath = process.argv[1]
}
if (import.meta.url === `file://${entryPath}`) {
  main().catch((error) => {
    process.stderr.write(`Fatal: ${error.message}\n`)
    process.exit(1)
  })
}
