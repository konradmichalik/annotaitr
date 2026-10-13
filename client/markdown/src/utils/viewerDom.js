import { isOpenableFileLink } from './links.js'

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

export function createPersistentInsertionMarker(id, blockEl, offset, number) {
  const marker = document.createElement('span')
  marker.className = 'insertion-marker'
  marker.dataset.highlightId = id
  marker.dataset.insertionId = id
  if (Number.isInteger(number)) { marker.dataset.noteNumber = String(number) }
  return placeMarker(marker, textRootOf(blockEl), offset)
}

/** The marker Add puts after a selection, which the composer anchors to until the text is saved. */
export function createTemporaryInsertionMarker(blockEl, offset) {
  const marker = document.createElement('span')
  marker.className = 'insertion-marker-temp'
  return placeMarker(marker, textRootOf(blockEl), offset)
}

/** Where a selection ends inside its block, counted as insertion offsets count: markers do not count. */
export function insertionPointAfter(el) {
  let blockEl = el.parentElement
  while (blockEl && !blockEl.dataset?.blockId) { blockEl = blockEl.parentElement }
  if (!blockEl) { return null }
  const root = textRootOf(blockEl)
  const range = document.createRange()
  range.selectNodeContents(root)
  range.setEndAfter(el)
  const offset = range.toString().replaceAll('\u200B', '').length
  const text = root.textContent.replaceAll('\u200B', '')
  return { blockEl, blockId: blockEl.dataset.blockId, offset, afterContext: text.slice(Math.max(0, offset - 50), offset) }
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
  const blockEl = container?.querySelector(`[data-block-id="${ann.blockId}"]`)
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
