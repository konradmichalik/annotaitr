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

export function createPersistentInsertionMarker(id, blockEl, offset) {
  const marker = document.createElement('span')
  marker.className = 'insertion-marker'
  marker.dataset.highlightId = id
  marker.dataset.insertionId = id
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
