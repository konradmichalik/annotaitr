/**
 * Builds the walkthrough the reviewer sees: the agent's explanation around the
 * real hunks from git. The agent never supplies diff text, so what is shown is
 * exactly what will be committed, explained or not.
 */

const STATUS_NOTE = { A: ' (new file)', D: ' (deleted)' }

/** A fence longer than any backtick run in the text, so a code fence in a hunk cannot close it. */
export function fenceFor(text) {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length))
  return '`'.repeat(Math.max(4, longest + 1))
}

/** The hunks of a file diff, without the `diff --git`, `index`, `---` and `+++` headers. */
export function hunksOnly(diff) {
  const start = diff.indexOf('\n@@')
  const body = diff.startsWith('@@') ? diff : (start === -1 ? '' : diff.slice(start + 1))
  return body.replace(/\n$/, '')
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/**
 * Text from git or the agent as one inline code span. The markdown renderer
 * has no escapes, so a backtick becomes the look-alike U+02CB, and a path with
 * a newline or another control character is shown quoted, as JSON.
 */
export function inlineCode(text) {
  const shown = CONTROL_CHARS.test(text) ? JSON.stringify(text) : text
  return `\`${shown.replaceAll('`', '\u02CB')}\``
}

const oneLine = (text) => text.replace(/\s*\n\s*/g, ' ')

function codeList(paths) {
  return paths.map(inlineCode).join(', ')
}

// Beyond a handful the list buries the overview; the tree marks every one of them anyway.
const MAX_LISTED = 5

function notExplainedLine(paths) {
  return paths.length > MAX_LISTED ? `${paths.length} files, marked in the file tree` : codeList(paths)
}

function overview({ explanation, compared, files, notExplained, unchanged }) {
  const added = files.reduce((sum, f) => sum + f.added, 0)
  const removed = files.reduce((sum, f) => sum + f.removed, 0)
  const count = `${files.length} ${files.length === 1 ? 'file' : 'files'}, +${added} −${removed}`
  const lines = [`# ${oneLine(explanation.title || `Changes on ${compared.branch}`)}`]
  if (explanation.summary) { lines.push(explanation.summary) }
  const sha = compared.mergeBase.slice(0, 7)
  lines.push(compared.uncommitted
    ? `**Compared:** uncommitted changes on ${inlineCode(compared.branch)} against \`HEAD\` (\`${sha}\`), untracked files included. ${count}.`
    : `**Compared:** ${inlineCode(compared.branch)} against ${inlineCode(compared.base)} (merge base \`${sha}\`), working tree and untracked files included. ${count}.`)
  if (compared.commits?.length > 0) {
    lines.push('**Commits:**', compared.commits.map((c) => `- \`${c.sha}\` ${inlineCode(c.subject)}`).join('\n'))
  }
  if (explanation.commit) { lines.push(`**After approval:** ${inlineCode(oneLine(explanation.commit))}`) }
  if (notExplained.length > 0) { lines.push(`**Not explained:** ${notExplainedLine(notExplained)}`) }
  if (unchanged.length > 0) { lines.push(`**Explained but unchanged:** ${codeList(unchanged)}`) }
  return lines
}

function fileSection(file, why) {
  const lines = [`## ${inlineCode(file.path)}${STATUS_NOTE[file.status] ?? ''}`, why ? oneLine(why) : 'The agent did not mention this change.']
  if (file.omitted) {
    lines.push(`+${file.added} −${file.removed}, not shown: ${file.omitted}.`)
    return lines
  }
  const hunks = hunksOnly(file.diff ?? '')
  const fence = fenceFor(hunks)
  const fencePath = CONTROL_CHARS.test(file.path) ? JSON.stringify(file.path) : file.path
  lines.push(`${fence}diff ${fencePath}\n${hunks}\n${fence}`)
  return lines
}

export function buildWalkthrough({ explanation = {}, compared, files }) {
  const explained = explanation.files ?? {}
  const lineFor = (path) => (Object.hasOwn(explained, path) ? explained[path] : null)
  const paths = new Set(files.map((f) => f.path))
  const notExplained = files.filter((f) => !lineFor(f.path)).map((f) => f.path)
  const unchanged = Object.keys(explained).filter((p) => !paths.has(p))
  const blocks = [
    ...overview({ explanation, compared, files, notExplained, unchanged }),
    ...files.flatMap((file) => fileSection(file, lineFor(file.path)))
  ]
  return blocks.join('\n\n') + '\n'
}
