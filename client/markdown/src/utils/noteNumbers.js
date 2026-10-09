import { countNewlines, diffLineRef, splitCodeInfo } from './diffLines.js'

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
/** `Foo.php · new L43-49` for a note on a `diff <path>` block, or null for any other note. */
function diffLocation(annotation, blocks) {
  const block = blocks.find((b) => b.id === annotation.blockId)
  const { meta } = splitCodeInfo(block?.language)
  const first = countNewlines((block?.content ?? '').slice(0, annotation.startOffset))
  const ref = diffLineRef(block, first, first + countNewlines(annotation.originalText))
  if (!ref || !meta) { return null }
  const short = ref.replace(` in ${meta}`, '').replace(/Lines? /g, 'L')
  return `${meta.split('/').pop()} · ${short}`
}

export function noteLocation(annotation, blocks) {
  const line = lineOf(annotation.blockId, blocks)
  if (!line) { return null }
  const inDiff = diffLocation(annotation, blocks)
  if (inDiff) { return inDiff }
  const heading = blocks.filter((block) => block.type === 'heading' && block.startLine <= line).at(-1)
  const title = heading?.content.replace(/<[^>]*>/g, '').replace(/`/g, '').trim()
  return title ? `${title} · L${line}` : `L${line}`
}
