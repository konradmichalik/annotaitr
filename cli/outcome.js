import { openBrowser } from '../server/core/browser.js'
import { withLifecycle } from '../server/core/lifecycle.js'
import { recordSession } from './session.js'
import { formatRepliesOnlyHeader } from '../server/core/session/repliesFormat.js'
import { formatRepliesSection } from '../server/image/common/repliesSection.js'
import { matchAnnotation, describeMatch } from '../server/image/common/elementMatch.js'

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

/** The element of a captured page a mark points at, named for the session. */
export const describeDomElement = (domMap) => (annotation) => describeMatch(matchAnnotation(domMap, annotation))

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
  const line = opened && decided ? await recordSession(opened, decision, { describeElement: describeDomElement(decision.domMap) }) : ''
  await handleOutcome(server, decision, () => composeOutput(decision, opened, line))
}

const imageReplies = (opened) => (carried, round) =>
  formatRepliesSection(carried, { round, kind: opened.target.kind, ...opened.imageSize })

/**
 * What goes to stdout: the verdict first, then last round's exchanges, then
 * the session line. `formatReplies(carried, round)` is the mode's section, the
 * image one unless a mode passes its own. `noun` is what the mode calls a numbered item.
 */
export function composeOutput(decision, opened, line, formatReplies = opened && imageReplies(opened), noun = 'mark') {
  const carried = decision.carried ?? []
  if (!opened || carried.length === 0) { return decision.output + line }
  const round = opened.previous.round
  // The replies were frozen when the reviewer decided, so a request landing afterwards cannot change what is printed.
  // Only this round's replies count: a thread carried twice also holds earlier rounds' reviewer replies.
  const head = decision.repliesOnly
    ? formatRepliesOnlyHeader({ approved: decision.approved, count: decision.replyCount, round, noun })
    : decision.output
  return head + formatReplies(carried, round) + line
}
