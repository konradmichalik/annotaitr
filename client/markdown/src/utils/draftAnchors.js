/**
 * Re-anchors the notes of a draft saved for an earlier version of the file.
 * Block ids are positions, so an edit above a note shifts its block; the
 * selected text, the text before an insertion or the element itself is what
 * still identifies it.
 */

const ELEMENT_TYPES = new Set(['image', 'diagram', 'math', 'pinpoint', 'link'])
const UNTOUCHED_TYPES = new Set(['global', 'source'])

function anchored(ann) {
  if (!ann.unanchored) { return ann }
  const { unanchored: _dropped, ...rest } = ann
  return rest
}

const unanchored = (ann) => ({ ...ann, unanchored: true })

/** The note's own block first, then the others by distance from where it was, earlier first on a tie. */
function byDistance(blockTexts, blockId) {
  const own = blockTexts.findIndex((block) => block.id === blockId)
  const at = own !== -1 ? own : Number(blockId?.match(/(\d+)$/)?.[1] ?? 0)
  return blockTexts
    .map((block, index) => ({ block, distance: Math.abs(index - at), index }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map(({ block }) => block)
}

function occurrences(text, wanted) {
  const found = []
  for (let index = text.indexOf(wanted); index !== -1; index = text.indexOf(wanted, index + 1)) { found.push(index) }
  return found
}

/** Where `wanted` is now: the occurrence closest to the old offset in the own block, else the first in the nearest block. */
function locate(blockTexts, blockId, wanted, oldOffset) {
  for (const block of byDistance(blockTexts, blockId)) {
    const found = occurrences(block.text, wanted)
    if (found.length === 0) { continue }
    const offset = block.id === blockId
      ? found.reduce((best, index) => (Math.abs(index - oldOffset) < Math.abs(best - oldOffset) ? index : best))
      : found[0]
    return { blockId: block.id, offset }
  }
  return null
}

const withoutSpace = (text) => text.replace(/\s+/g, '')

/** A selection running past its block's end still reads the same over the blocks after it. */
function spansUnchanged(ann, blockTexts) {
  const own = blockTexts.findIndex((block) => block.id === ann.blockId)
  if (own === -1 || ann.endOffset <= blockTexts[own].text.length) { return false }
  const following = blockTexts.slice(own).map((block) => block.text).join('')
  return withoutSpace(following.slice(ann.startOffset)).startsWith(withoutSpace(ann.originalText))
}

function reanchorText(ann, blockTexts) {
  const { originalText } = ann
  const own = blockTexts.find((block) => block.id === ann.blockId)
  if (own?.text.slice(ann.startOffset, ann.endOffset) === originalText) { return anchored(ann) }
  if (spansUnchanged(ann, blockTexts)) { return anchored(ann) }
  const found = locate(blockTexts, ann.blockId, originalText, ann.startOffset)
  if (!found) { return unanchored(ann) }
  return anchored({ ...ann, blockId: found.blockId, startOffset: found.offset, endOffset: found.offset + originalText.length })
}

function reanchorInsertion(ann, blockTexts) {
  const context = ann.afterContext || ''
  if (!context) { return unanchored(ann) }
  const own = blockTexts.find((block) => block.id === ann.blockId)
  if (own?.text.slice(ann.startOffset - context.length, ann.startOffset) === context) { return anchored(ann) }
  const found = locate(blockTexts, ann.blockId, context, ann.startOffset - context.length)
  if (!found) { return unanchored(ann) }
  const offset = found.offset + context.length
  return anchored({ ...ann, blockId: found.blockId, startOffset: offset, endOffset: offset })
}

function reanchorElement(ann, blockTexts, matches) {
  const block = byDistance(blockTexts, ann.blockId).find((candidate) => matches(ann, candidate.id))
  if (!block) { return unanchored(ann) }
  return block.id === ann.blockId ? anchored(ann) : anchored({ ...ann, blockId: block.id })
}

function reanchor(ann, blockTexts, matches) {
  if (ann.type === 'NOTES' || UNTOUCHED_TYPES.has(ann.targetType)) { return ann }
  if (ann.type === 'INSERTION') { return reanchorInsertion(ann, blockTexts) }
  if (ELEMENT_TYPES.has(ann.targetType)) { return reanchorElement(ann, blockTexts, matches) }
  if (!ann.originalText) { return ann }
  const result = reanchorText(ann, blockTexts)
  if (ann.targetType === 'token' && !result.unanchored && !matches(result, result.blockId)) { return unanchored(ann) }
  return result
}

/**
 * Each note kept where it still is, moved to where it is now, or marked
 * `unanchored`. `blockTexts` lists `{ id, text }` in document order, in the
 * text the offsets count in; `matches(ann, blockId)` says whether an element
 * or a token note fits that block.
 */
export function reanchorAnnotations(annotations, blockTexts, matches = () => false) {
  return annotations.map((ann) => reanchor(ann, blockTexts, matches))
}

// The source view is a table with a number cell before each line's cell.
const sourceMeta = (line, offset) => ({ parentTagName: 'TD', parentIndex: line * 2 + 1, textOffset: offset })

/**
 * Source view notes re-anchored to the lines of the file as it is now. Each
 * line renders as one text node, so metas follow from line and offset.
 */
export function reanchorSourceNotes(annotations, content) {
  const lines = content.split('\n').map((line, index) => ({ id: `source-line-${index}`, text: line || '\n' }))
  return annotations.map((ann) => {
    if (ann.targetType !== 'source' || !ann.originalText) { return ann }
    const result = reanchorText(ann, lines)
    const line = Number(result.blockId.split('-').pop())
    // A selection over several unchanged lines keeps the metas it has.
    if (result.unanchored || result.endOffset > lines[line].text.length) { return result }
    return { ...result, startMeta: sourceMeta(line, result.startOffset), endMeta: sourceMeta(line, result.endOffset) }
  })
}
