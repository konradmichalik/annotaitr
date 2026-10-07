// Mirrors getBlockOrder and sortAnnotations in server/markdown/feedback.js, so a
// card shows the number its note gets in the feedback the agent reads.
function sourceLine(blockId) {
  const match = blockId?.match(/^source-line-(\d+)$/)
  return match ? parseInt(match[1], 10) + 1 : null
}

function lineOf(blockId, blocks) {
  return sourceLine(blockId) ?? blocks.find((block) => block.id === blockId)?.startLine ?? null
}

function blockOrder(blockId, blocks) {
  return lineOf(blockId, blocks) || Infinity
}

export function sortNotes(annotations, blocks) {
  return [...annotations].sort((a, b) => {
    const blockA = blockOrder(a.blockId, blocks)
    const blockB = blockOrder(b.blockId, blocks)
    if (blockA !== blockB) { return blockA - blockB }
    return a.startOffset - b.startOffset
  })
}

/** Numbered notes: everything but agent notes and comments about the whole file. */
export const isNumbered = (a) => a.type !== 'NOTES' && a.targetType !== 'global'

/** Card number per note id, counted across `files` in order, as the multi-file feedback counts them. */
export function noteNumbers(files) {
  const numbers = new Map()
  for (const file of files) {
    const sorted = sortNotes(file.annotations.filter(isNumbered), file.blocks || [])
    sorted.forEach((annotation) => numbers.set(annotation.id, numbers.size + 1))
  }
  return numbers
}

/** Where a note sits: the section it falls in and its line, or null when its block is unknown. */
export function noteLocation(annotation, blocks) {
  const line = lineOf(annotation.blockId, blocks)
  if (!line) { return null }
  const heading = blocks.filter((block) => block.type === 'heading' && block.startLine <= line).at(-1)
  return heading ? `${heading.content} · L${line}` : `L${line}`
}
