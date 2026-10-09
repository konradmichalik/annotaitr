// A copy of client/markdown/src/utils/diffLines.js: server and client share no modules.
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

function isMetaLine(text) {
  return text.startsWith('--- ') || text.startsWith('+++ ') || text.startsWith('\\') ||
    text.startsWith('diff --git ') || text.startsWith('index ')
}

/**
 * Split a unified diff into lines with their kind and their old and new line
 * numbers, taken from the hunk headers. Lines before the first hunk header have
 * no numbers, since nothing says where they start.
 */
export function parseDiffLines(content) {
  let oldNo = null
  let newNo = null
  return content.split('\n').map((text) => {
    const hunk = HUNK_HEADER.exec(text)
    if (hunk) {
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      return { kind: 'hunk', text, oldNo: null, newNo: null }
    }
    if (isMetaLine(text)) {
      return { kind: 'meta', text, oldNo: null, newNo: null }
    }
    if (text.startsWith('+')) {
      const line = { kind: 'add', text, oldNo: null, newNo }
      if (newNo !== null) { newNo += 1 }
      return line
    }
    if (text.startsWith('-')) {
      const line = { kind: 'del', text, oldNo, newNo: null }
      if (oldNo !== null) { oldNo += 1 }
      return line
    }
    const line = { kind: 'context', text, oldNo, newNo }
    if (oldNo !== null) { oldNo += 1; newNo += 1 }
    return line
  })
}

export function countDiffLines(lines) {
  return {
    added: lines.filter((l) => l.kind === 'add').length,
    removed: lines.filter((l) => l.kind === 'del').length
  }
}

/** A fence info string such as `diff src/Foo.php` holds the language first, then free text. */
export function splitCodeInfo(info) {
  const [language = '', ...rest] = (info ?? '').trim().split(/\s+/)
  return { language, meta: rest.join(' ') }
}

const lineRef = (first, last) => (first === last ? `Line ${first}` : `Lines ${first}-${last}`)

/**
 * Where lines `firstLine` to `lastLine` (0-based, inside the block) of a
 * `diff <path>` code block sit in the changed file: the new numbers of added
 * and unchanged lines, the old ones of removed lines, and the path. Null for
 * any other block, or when the lines carry no number (a hunk header).
 */
export function diffLineRef(block, firstLine, lastLine) {
  const { language, meta } = splitCodeInfo(block?.language)
  if (block?.type !== 'code' || language !== 'diff') { return null }
  const lines = parseDiffLines(block.content || '').slice(firstLine, lastLine + 1)
  const newNos = lines.filter((l) => l.kind !== 'del' && l.newNo !== null).map((l) => l.newNo)
  const oldNos = lines.filter((l) => l.kind === 'del' && l.oldNo !== null).map((l) => l.oldNo)
  const sides = [
    newNos.length > 0 && `new ${lineRef(Math.min(...newNos), Math.max(...newNos))}`,
    oldNos.length > 0 && `old ${lineRef(Math.min(...oldNos), Math.max(...oldNos))}`
  ].filter(Boolean)
  if (sides.length === 0) { return null }
  return `${sides.join(', ')}${meta ? ` in ${meta}` : ''}`
}
