import { openBrowser } from '../server/core/browser.js'
import { withLifecycle } from '../server/core/lifecycle.js'

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
export async function serveUntilDecision(started) {
  const server = withLifecycle(started)
  process.stderr.write(`Server running at ${server.url}\n`)
  await openBrowser(server.url)

  const decision = await server.waitForDecision()
  await handleOutcome(server, decision, () => decision.output)
}
