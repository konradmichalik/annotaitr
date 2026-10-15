import { readError } from '../utils/readError.js'

const UNREACHABLE = 'Could not reach the annotator server'

async function send(path, init) {
  try {
    const res = await fetch(`/api/threads/${path}`, init)
    if (!res.ok) { return { error: await readError(res) } }
    return (await res.json()).data ?? {}
  } catch {
    return { error: UNREACHABLE }
  }
}

export function postReply(handle, text) {
  return send(`${handle}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })
}

export async function removeReply(handle, id) {
  const result = await send(`${handle}/replies/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return result.error ? result : { removed: true }
}
