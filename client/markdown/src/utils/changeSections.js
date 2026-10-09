import { countDiffLines, parseDiffLines, splitCodeInfo } from './diffLines.js'

/**
 * Reads the walkthrough `annotaitr changes` writes (server/changes/walkthrough.js)
 * back into an overview and one entry per changed file, for the pull request
 * layout. The blocks stay the parser's flat blocks, so annotations, numbering
 * and feedback work on them exactly as in any markdown document.
 */

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
    path: heading.content.replace(STATUS_SUFFIX, ''),
    status: suffix === 'new file' ? 'A' : suffix === 'deleted' ? 'D' : 'M',
    heading,
    blocks,
    explained: !blocks.some((b) => b.type === 'paragraph' && b.content.trim() === NOT_EXPLAINED),
    omitted: omitted ? omitted[3] : null,
    ...counts
  }
}

export function groupChangeSections(blocks) {
  const overview = []
  const files = []
  let current = null
  for (const block of blocks) {
    if (block.type === 'heading' && block.level === 2) {
      current = { heading: block, blocks: [] }
      files.push(current)
    } else if (current) {
      current.blocks.push(block)
    } else {
      overview.push(block)
    }
  }
  return { overview, files: files.map((f) => fileEntry(f.heading, f.blocks)) }
}
