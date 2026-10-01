import { readError } from './readError.js'

/**
 * Hand the server every frame its output needs: ask which times it wants,
 * grab each from the player and upload it as a PNG. `onProgress(done, total)`
 * drives the progress shown while this runs.
 */
export async function uploadFrames(controller, onProgress) {
  const planRes = await fetch('/api/frame-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration: controller.duration, width: controller.width, height: controller.height })
  })
  if (!planRes.ok) { throw new Error(await readError(planRes)) }
  const { times } = (await planRes.json()).data

  for (const [index, time] of times.entries()) {
    onProgress(index, times.length)
    const frame = await controller.grabFrame(time)
    const res = await fetch(`/api/frames?t=${encodeURIComponent(String(time))}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: frame
    })
    if (!res.ok) { throw new Error(await readError(res)) }
  }
  onProgress(times.length, times.length)
}
