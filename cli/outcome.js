import { openBrowser } from '../server/core/browser.js'
import { withLifecycle } from '../server/core/lifecycle.js'
import { recordSession } from './session.js'
import { formatRepliesSection, formatRepliesOnlyHeader } from '../server/image/common/repliesSection.js'

export async function handleOutcome(server, decision, buildOutput) {
  if (decision.aborted) {
    process.stderr.write('Interrupted. No decision made.\n')
    server.shutdown()
    process.exit(1)
    return
  }

  if (decision.disconnected) {
    process.stderr.write('Browser tab closed. No decision made.\n')
    server.shutdown()
    process.exit(1)
    return
  }

  // Give the browser time to receive the response before the server closes
  await new Promise((r) => setTimeout(r, 500))

  process.stderr.write(
    decision.approved
      ? (decision.feedback || decision.annotationCount
        ? `Decision: Approved with ${decision.annotationCount} note(s)\n`
        : 'Decision: Approved (no changes)\n')
      : `Decision: Feedback with ${decision.annotationCount} annotation(s)\n`
  )

  process.stdout.write(buildOutput(), () => {
    server.shutdown()
    process.exit(0)
  })
}

/**
 * Open the browser on a started image, video or document server, block until
 * the user decides and print the output the server rendered for the decision.
 */
export async function serveUntilDecision(started, opened = null) {
  const server = withLifecycle(started)
  process.stderr.write(`Server running at ${server.url}\n`)
  await openBrowser(server.url)

  const decision = await server.waitForDecision()
  const decided = !decision.aborted && !decision.disconnected
  const carried = opened && decided ? opened.replies?.carried() ?? [] : []
  const line = opened && decided ? await recordSession(opened, { ...decision, carried }) : ''
  await handleOutcome(server, decision, () => decisionText(decision, carried, opened) + line)
}

// The verdict first, then last round's exchanges, so the agent's first line stays the decision.
function decisionText(decision, carried, opened) {
  if (carried.length === 0) { return decision.output }
  const round = opened.previous.round
  const view = { round, kind: opened.target.kind, ...opened.imageSize }
  // Only this round's replies count: a thread carried twice also holds earlier rounds' reviewer replies.
  const head = decision.repliesOnly
    ? formatRepliesOnlyHeader({ approved: decision.approved, count: opened.replies.count(), round })
    : decision.output
  return head + formatRepliesSection(carried, view)
}
