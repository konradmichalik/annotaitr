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
