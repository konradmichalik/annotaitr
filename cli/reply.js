import { isSessionId } from '../server/core/session/identity.js'
import { updateSession, sessionDir } from '../server/core/session/store.js'
import { addReply } from '../server/core/session/reply.js'

const REPLY_OPTIONS = { '--session': 'sessionId', '--to': 'to', '--status': 'status', '--text': 'text' }
const REPLY_USAGE = 'Usage: annotaitr reply --session <id> --to <handle> --status <status> --text "…"'

// Every option takes a value, and a value may start with a dash (reply text often does).
export function parseReplyArgs(args) {
  const options = {}
  for (let i = 0; i < args.length; i += 2) {
    const key = REPLY_OPTIONS[args[i]]
    if (!key) { return { error: `Unknown reply argument: ${args[i]}` } }
    if (args[i + 1] === undefined) { return { error: `${args[i]} requires a value` } }
    options[key] = args[i + 1]
  }
  const missing = Object.entries(REPLY_OPTIONS).filter(([, key]) => options[key] === undefined).map(([flag]) => flag)
  if (missing.length > 0) { return { error: `Missing ${missing.join(', ')}` } }
  if (!isSessionId(options.sessionId)) {
    return { error: `Invalid session id "${options.sessionId}": use the 12 characters printed after "Session:"` }
  }
  return options
}

export async function runReply(args, { now = Date.now(), dir = sessionDir() } = {}) {
  const parsed = parseReplyArgs(args)
  if (parsed.error) { return { error: `${parsed.error}\n${REPLY_USAGE}` } }
  const result = await updateSession(parsed.sessionId, dir, (session) => addReply(session, { ...parsed, now }))
  if (result.missing) { return { error: `No review session ${parsed.sessionId} in ${dir}` } }
  if (result.error) { return { error: result.error } }
  return { output: `Recorded ${parsed.status} reply to #${result.thread.handle} in session ${parsed.sessionId} (round ${result.session.round}).\n` }
}
