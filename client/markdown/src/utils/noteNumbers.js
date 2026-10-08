// Mirrors getBlockOrder and sortAnnotations in server/markdown/feedback.js, so the
// cards list the notes in the order the feedback the agent reads lists them.
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

/** Card number per note id: the stable number each note got when it was added. */
export function noteNumbers(files) {
  const numbers = new Map()
  for (const file of files) {
    for (const annotation of file.annotations) {
      if (Number.isInteger(annotation.number)) { numbers.set(annotation.id, annotation.number) }
    }
  }
  return numbers
}

/** Where a note sits: the section it falls in and its line, or null when its block is unknown. */
export function noteLocation(annotation, blocks) {
  const line = lineOf(annotation.blockId, blocks)
  if (!line) { return null }
  const heading = blocks.filter((block) => block.type === 'heading' && block.startLine <= line).at(-1)
  const title = heading?.content.replace(/<[^>]*>/g, '').trim()
  return title ? `${title} · L${line}` : `L${line}`
}
