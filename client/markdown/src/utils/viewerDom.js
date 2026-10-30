import { isOpenableFileLink } from './links.js'
import { reanchorAnnotations } from './draftAnchors.js'
import { isOldBlock } from './fileVersions.js'
import { markIndex } from '../../../shared/utils/intents.js'

/**
 * The selector of a rendered block. A Read view block id holds its file's
 * path, so quotes, backslashes and line breaks are escaped for the attribute.
 */
export function blockSelector(id) {
  return `[data-block-id="${String(id).replace(/["\\]/g, '\\$&').replace(/\n/g, '\\a ')}"]`
}

export function getLinkInfo(el) {
  const linkEl = el.closest('a[data-href]') || el.querySelector('a[data-href]')
  const linkUrl = linkEl?.dataset?.href || null
  return { linkUrl, linkIsOpenable: isOpenableFileLink(linkUrl) }
}

export function removeInsertionMarker(el) {
  const parent = el?.parentNode
  if (parent) {
    parent.removeChild(el)
    parent.normalize()
  }
}

/**
 * The text of the diff line a gutter belongs to, as a range from its first to its
 * last text node, so highlights that split the line into pieces are included.
 * Null for a line without text.
 */
export function diffLineRange(gutter) {
  const line = gutter.closest('.diff-line')
  if (!line) { return null }
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  const texts = []
  while (walker.nextNode()) { if (walker.currentNode.length > 0) { texts.push(walker.currentNode) } }
  if (texts.length === 0) { return null }
  const last = texts.at(-1)
  const range = document.createRange()
  range.setStart(texts[0], 0)
  range.setEnd(last, last.length)
  return range
}

/**
 * The element whose text an offset inside a block counts from: the code of a
 * code block, since its toolbar and a diff header come first in the DOM, else
 * the block itself. Selections in useHighlighter count the same way.
 */
export function textRootOf(blockEl) {
  return blockEl.querySelector('pre > code') ?? blockEl
}

/** Every block as `{ id, text }` in document order, in the text selection offsets count in. */
export function blockTexts(container) {
  return Array.from(container?.querySelectorAll('[data-block-id]') ?? [], (blockEl) => ({
    id: blockEl.dataset.blockId,
    text: textRootOf(blockEl).textContent
  }))
}

// web-highlighter's index for a parent that is the root itself.
const ROOT_INDEX = -2

/** The text node a block offset falls in, as a range start takes it. */
function textPointAt(root, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let count = 0
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (count + node.length > offset) { return { node, offset: offset - count } }
    count += node.length
  }
  return null
}

// Text a selection never takes: parts of a changes card that are switched off, and labels for screen readers.
export const OFF_TEXT = '.is-off, .visually-hidden'

/** Reads `length` characters on from a point, across blocks as a range does but without switched off text, and where they end. */
function readFrom(container, start, length) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(OFF_TEXT) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  })
  walker.currentNode = start.node
  let text = start.node.data.slice(start.offset, start.offset + length)
  let end = { node: start.node, offset: start.offset + text.length }
  while (text.length < length && walker.nextNode()) {
    const piece = walker.currentNode.data.slice(0, length - text.length)
    text += piece
    end = { node: walker.currentNode, offset: piece.length }
  }
  return { text, end }
}

/** The meta web-highlighter stores for a point: the nearest parent that is no highlight, its index by tag, the text before it. */
function domMeta(container, { node, offset }) {
  let parent = node.parentElement
  while (parent?.dataset.highlightId) { parent = parent.parentElement }
  const index = parent === container ? ROOT_INDEX : Array.prototype.indexOf.call(container.getElementsByTagName(parent.tagName), parent)
  const range = document.createRange()
  range.selectNodeContents(parent)
  range.setEnd(node, 0)
  return { parentTagName: parent.tagName, parentIndex: index, textOffset: range.toString().length + offset }
}

/**
 * The start and end meta of a selection of `text` from an offset in a block,
 * for a note whose stored metas no longer match the rendered file. Null when
 * the block is missing or the rendered text from there is not `text`.
 */
export function textAnchorMetas(container, blockId, startOffset, text) {
  const blockEl = container?.querySelector(blockSelector(blockId))
  if (!blockEl) { return null }
  const start = textPointAt(textRootOf(blockEl), startOffset)
  if (!start) { return null }
  const read = readFrom(container, start, text.length)
  if (read.text !== text) { return null }
  return { startMeta: domMeta(container, start), endMeta: domMeta(container, read.end) }
}

/** The range `text` covers from an offset in a block, or null when the rendered text from there is not `text`. */
function textRangeAt(container, blockId, startOffset, text) {
  const blockEl = container?.querySelector(`[data-block-id="${blockId}"]`)
  const start = blockEl && textPointAt(textRootOf(blockEl), startOffset)
  if (!start) { return null }
  const read = readFrom(container, start, text.length)
  if (read.text !== text) { return null }
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(read.end.node, read.end.offset)
  return range
}

// The block the server's line falls in: the last one starting at or before it.
function blockAtLine(blocks, line) {
  return blocks.filter((block) => Number.isFinite(block.startLine) && block.startLine <= line).at(-1) ?? null
}

/**
 * Where last round's text note shows in the rendered file. The stored offsets
 * count only while they still read the quote; else the quote is searched from
 * the block at the line the server found it on. Null for anything without a
 * text place: orphans, general comments, insertions and element notes.
 */
export function previousQuoteRange(container, blocks, thread) {
  const { annotation, place } = thread
  if (thread.anchor === 'orphan' || !place?.quote || annotation.type === 'INSERTION' || annotation.targetType) { return null }
  const exact = thread.anchor === 'exact' && textRangeAt(container, annotation.blockId, annotation.startOffset, place.quote)
  if (exact) { return exact }
  const hint = Number.isFinite(place.line) ? blockAtLine(blocks, place.line) : null
  const seed = { ...annotation, originalText: place.quote, blockId: hint?.id ?? annotation.blockId, startOffset: 0, endOffset: place.quote.length }
  const [found] = reanchorAnnotations([seed], blockTexts(container))
  return found.unanchored ? null : textRangeAt(container, found.blockId, found.startOffset, place.quote)
}

const PINPOINT_TEXT_LIMIT = 200

const pinpointText = (blockEl) => {
  const text = blockEl.textContent || ''
  return text.length > PINPOINT_TEXT_LIMIT ? `${text.slice(0, PINPOINT_TEXT_LIMIT)}...` : text
}

/** Per element type: whether a rendered block (and its parsed block) still holds what the note points at. */
const ELEMENT_CHECKS = {
  image: (blockEl, _block, ann) => Array.from(blockEl.querySelectorAll('.annotatable-image-wrapper')).some((el) => el.dataset.imageSrc === ann.imageSrc),
  link: (blockEl, _block, ann) => Array.from(blockEl.querySelectorAll('a[href]')).some((a) => a.textContent === ann.originalText),
  pinpoint: (blockEl, _block, ann) => pinpointText(blockEl) === ann.originalText,
  diagram: (_blockEl, block, ann) => block?.content === ann.originalText,
  math: (_blockEl, block, ann) => block?.content === ann.originalText,
  token: (blockEl, _block, ann) => findTokenSpan(blockEl, ann) !== null
}

function elementMatches(container, blocks, ann, blockId) {
  const blockEl = container.querySelector(blockSelector(blockId))
  const check = ELEMENT_CHECKS[ann.targetType]
  return Boolean(blockEl && check?.(blockEl, blocks.find((block) => block.id === blockId), { ...ann, blockId }))
}

/**
 * A restored draft's notes re-anchored to the file as rendered now. Text
 * selections also get fresh metas: the stored ones count elements of the old
 * version and would highlight whatever sits there now.
 */
export function reanchorToDom(container, blocks, annotations) {
  const matches = (ann, blockId) => elementMatches(container, blocks, ann, blockId)
  const texts = blockTexts(container)
  // A note on the old file looks among old blocks only, any other among the rest: both can hold the same words.
  const textsFor = (ann) => texts.filter((block) => isOldBlock(block.id) === isOldBlock(ann.blockId))
  return annotations.map((ann) => reanchorAnnotations([ann], textsFor(ann), matches)[0]).map((ann) => {
    if (ann.unanchored || ann.targetType || ann.type === 'NOTES' || ann.type === 'INSERTION' || !ann.originalText) { return ann }
    const metas = textAnchorMetas(container, ann.blockId, ann.startOffset, ann.originalText)
    return metas ? { ...ann, ...metas } : { ...ann, unanchored: true }
  })
}

export function createPersistentInsertionMarker(id, blockEl, offset, number) {
  const marker = document.createElement('span')
  marker.className = 'insertion-marker'
  marker.dataset.highlightId = id
  marker.dataset.insertionId = id
  if (Number.isInteger(number)) { marker.dataset.noteNumber = String(number); marker.dataset.noteMark = String(markIndex(number)) }
  return placeMarker(marker, textRootOf(blockEl), offset)
}

function placeMarker(marker, blockEl, offset) {
  marker.textContent = '​'

  const range = document.createRange()
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT)
  let charCount = 0
  let placed = false

  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.parentElement?.closest('.insertion-marker')) { continue }
    const len = node.textContent.length
    if (charCount + len >= offset) {
      range.setStart(node, offset - charCount)
      range.collapse(true)
      range.insertNode(marker)
      placed = true
      break
    }
    charCount += len
  }

  if (!placed) {
    blockEl.appendChild(marker)
  }

  return marker
}

function findTokenSpan(blockEl, ann) {
  const codeEl = blockEl.querySelector('code.hljs')
  if (!codeEl) { return null }
  const range = document.createRange()
  for (const span of codeEl.querySelectorAll('span')) {
    if (span.textContent !== ann.originalText) { continue }
    range.selectNodeContents(codeEl)
    range.setEnd(span, 0)
    if (range.toString().length === ann.startOffset) {
      return span
    }
  }
  return null
}

/** The rendered element an element-level annotation (image, diagram, math, pinpoint, link, token) points at. */
export function findAnnotationElement(container, ann) {
  const blockEl = container?.querySelector(blockSelector(ann.blockId))
  if (!blockEl) { return null }
  switch (ann.targetType) {
    case 'image':
      return blockEl.querySelector(`.annotatable-image-wrapper[data-image-src="${CSS.escape(ann.imageSrc)}"]`)
    case 'diagram':
      return blockEl.querySelector('.diagram-render-area') || blockEl
    case 'math':
      return blockEl.querySelector('.annotatable-math')
    case 'pinpoint':
      return blockEl
    case 'link': {
      const anchors = blockEl.querySelectorAll('a[href]')
      return Array.from(anchors).find(a => a.textContent === ann.originalText) || anchors[0] || null
    }
    case 'token':
      return findTokenSpan(blockEl, ann)
    default:
      return null
  }
}
