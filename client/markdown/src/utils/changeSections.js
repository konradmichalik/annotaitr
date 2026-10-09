import { countDiffLines, parseDiffLines, splitCodeInfo } from './diffLines.js'

/**
 * Reads the walkthrough `annotaitr changes` writes (server/changes/walkthrough.js)
 * back into an overview and one entry per changed file, for the pull request
 * layout. The blocks stay the parser's flat blocks, so annotations, numbering
 * and feedback work on them exactly as in any markdown document.
 */

export const STATUS_LABEL = { A: 'Added', M: 'Modified', D: 'Deleted' }

const STATUS_SUFFIX = /\s+\((new file|deleted)\)$/
const OMITTED = /^\+(\d+) −(\d+), not shown: (.+)\.$/
const NOT_EXPLAINED = 'The agent did not mention this change.'

function isDiffBlock(block) {
  return block.type === 'code' && splitCodeInfo(block.language).language === 'diff'
}

function fileEntry(heading, blocks) {
  const suffix = heading.content.match(STATUS_SUFFIX)?.[1]
  const omittedLine = blocks.find((b) => b.type === 'paragraph' && OMITTED.test(b.content.trim()))
  const omitted = omittedLine ? omittedLine.content.trim().match(OMITTED) : null
  const counts = omitted
    ? { added: Number(omitted[1]), removed: Number(omitted[2]) }
    : blocks.filter(isDiffBlock).reduce((sum, b) => {
      const c = countDiffLines(parseDiffLines(b.content))
      return { added: sum.added + c.added, removed: sum.removed + c.removed }
    }, { added: 0, removed: 0 })
  return {
    // The walkthrough writes the path as inline code, so markdown in a file name stays literal.
    path: heading.content.replace(STATUS_SUFFIX, '').replace(/^`(.*)`$/, '$1'),
    status: suffix === 'new file' ? 'A' : suffix === 'deleted' ? 'D' : 'M',
    heading,
    blocks,
    explained: !blocks.some((b) => b.type === 'paragraph' && b.content.trim() === NOT_EXPLAINED),
    ...counts
  }
}

/**
 * The overview (the first heading and what follows it), the agent's groups
 * (any later top-level heading, with its reason) and the files, one per
 * second-level heading. Without groups, `groups` is empty.
 */
export function groupChangeSections(blocks) {
  const overview = []
  const groups = []
  const rawFiles = []
  let group = null
  let file = null
  for (const block of blocks) {
    if (block.type === 'heading' && block.level === 1 && overview.length > 0) {
      group = { title: block.content, heading: block, blocks: [], files: [] }
      groups.push(group)
      file = null
    } else if (block.type === 'heading' && block.level === 2) {
      file = { heading: block, blocks: [], group }
      rawFiles.push(file)
    } else if (file) {
      file.blocks.push(block)
    } else if (group) {
      group.blocks.push(block)
    } else {
      overview.push(block)
    }
  }
  const files = rawFiles.map((f) => fileEntry(f.heading, f.blocks))
  const withFiles = groups.map((g) => ({ ...g, files: files.filter((_, i) => rawFiles[i].group === g) }))
  return { overview, groups: withFiles, files }
}

/** How many reviewer notes sit on the overview and on each changed file. */
export function noteCounts(sections, annotations) {
  const pathOf = new Map(sections.files.flatMap((f) => [f.heading, ...f.blocks].map((b) => [b.id, f.path])))
  // The agent's group headings and reasons count with the overview: they are its text, not a file's.
  const overviewIds = new Set([...sections.overview, ...sections.groups.flatMap((g) => [g.heading, ...g.blocks])].map((b) => b.id))
  const byPath = new Map()
  let overview = 0
  for (const ann of annotations) {
    if (ann.type === 'NOTES' || ann.targetType === 'global') { continue }
    if (overviewIds.has(ann.blockId)) { overview += 1; continue }
    const path = pathOf.get(ann.blockId)
    if (path) { byPath.set(path, (byPath.get(path) ?? 0) + 1) }
  }
  return { overview, byPath }
}
