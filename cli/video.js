import { resolve as resolvePath, basename } from 'node:path'
import { captureFlagError } from './args.js'
import { fail } from './help.js'
import { serveUntilDecision } from './outcome.js'
import { openSession } from './session.js'

/**
 * A video needs no playwright (the browser plays it and grabs frames), only
 * @napi-rs/canvas to render the output, so it gets its own loader with its
 * own install hint.
 */
async function loadVideoRuntime() {
  try {
    const [video, adapter] = await Promise.all([
      import('../server/image/video/resolve.js'),
      import('../server/image/video/adapter.js')
    ])
    return { resolveVideoFile: video.resolveVideoFile, buildVideoServer: adapter.buildVideoServer }
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        'Annotating a video needs @napi-rs/canvas, an optional dependency. Install it with: npm i @napi-rs/canvas'
      )
    }
    throw error
  }
}

export async function runVideo({ target, origin, viewportSpec, delaySpec, session = {} }) {
  const flagError = captureFlagError('a video file', { viewportSpec, delaySpec })
  if (flagError) { fail(flagError); return }
  const { resolveVideoFile, buildVideoServer } = await loadVideoRuntime()
  let video
  try {
    video = await resolveVideoFile(resolvePath(target))
  } catch (error) {
    fail(error.message)
    return
  }

  const opened = await openSession({ identity: resolvePath(target), target: { kind: 'video', label: basename(target) }, ...session })
  if (opened.error) { fail(opened.error); return }
  await serveUntilDecision(await buildVideoServer({ video, origin, targetLabel: basename(target) }), opened)
}
