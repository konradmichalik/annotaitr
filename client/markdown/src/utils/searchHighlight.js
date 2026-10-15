/**
 * DOM-based search highlighting.
 * Injects/removes <mark> elements for text search matches.
 */

const MATCH_CLASS = 'search-match'
const ACTIVE_CLASS = 'search-match-active'

// Selectors for containers whose text content should not be searched
// (rendered diagrams, hidden source blocks, UI chrome, line numbers, etc.)
const SKIP_SELECTOR = [
  'svg',
  '.source-line-number',
  '.annotation-toolbar',
  '.comment-popover',
  '.diagram-render-area',
  '.diagram-source',
  '.diagram-controls',
  '.code-copy-btn',
  '[hidden]',
  '.visually-hidden',
].join(', ')

/**
 * Walk all text nodes in container, find case-insensitive matches for query,
 * and wrap them in <mark class="search-match">.
 * Skips text nodes inside <mark> elements (avoids double-wrapping).
 * Returns an array of the created <mark> elements.
 */
export function highlightMatches(container, query) {
  if (!container || !query) { return [] }

  const lowerQuery = query.toLowerCase()
  const marks = []

  // Collect text nodes first to avoid walking newly inserted marks
  const textNodes = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest('mark')) { return NodeFilter.FILTER_REJECT }
      if (node.parentElement?.closest(SKIP_SELECTOR)) { return NodeFilter.FILTER_REJECT }
      return NodeFilter.FILTER_ACCEPT
    }
  })
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode)
  }

  for (const node of textNodes) {
    const text = node.textContent
    const lowerText = text.toLowerCase()
    const indices = []
    let idx = 0

    while ((idx = lowerText.indexOf(lowerQuery, idx)) !== -1) {
      indices.push(idx)
      idx += lowerQuery.length
    }

    if (indices.length === 0) { continue }

    const parent = node.parentNode
    const frag = document.createDocumentFragment()
    let lastEnd = 0

    for (const start of indices) {
      if (start > lastEnd) {
        frag.appendChild(document.createTextNode(text.slice(lastEnd, start)))
      }
      const mark = document.createElement('mark')
      mark.className = MATCH_CLASS
      mark.textContent = text.slice(start, start + query.length)
      frag.appendChild(mark)
      marks.push(mark)
      lastEnd = start + query.length
    }

    if (lastEnd < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastEnd)))
    }

    parent.replaceChild(frag, node)
  }

  return marks
}

/**
 * Set the active match class on matches[activeIndex] and scroll it into view.
 * Removes active class from all other matches.
 */
export function setActiveMatch(matches, activeIndex) {
  for (let i = 0; i < matches.length; i++) {
    matches[i].classList.toggle(ACTIVE_CLASS, i === activeIndex)
  }
  if (matches[activeIndex]) {
    matches[activeIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

/**
 * Remove all search-match <mark> elements, restoring original text nodes.
 * Calls normalize() only on direct parents of removed marks (not the entire container)
 * to avoid disrupting web-highlighter's [data-highlight-id] spans.
 */
export function clearSearchHighlights(container) {
  if (!container) { return }

  const marks = container.querySelectorAll(`mark.${MATCH_CLASS}`)
  const parentsToNormalize = new Set()

  for (const mark of marks) {
    const parent = mark.parentNode
    if (!parent) { continue }
    const text = document.createTextNode(mark.textContent)
    parent.replaceChild(text, mark)
    parentsToNormalize.add(parent)
  }

  for (const parent of parentsToNormalize) {
    parent.normalize()
  }
}
