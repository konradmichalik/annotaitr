/**
 * Grouping and attribute helpers for balanced HTML wrappers (<details>, <div>, …).
 *
 * The parser emits a wrapper as three flat blocks (open marker, inner blocks,
 * close marker) and a quote with nested blocks as a container block followed by
 * children that carry its id in `parentId`, so every inner block stays
 * individually annotatable. Rendering them flat would break elements whose
 * semantics depend on real nesting: an `innerHTML = '<details>'` is auto-closed
 * by the browser, so the accordion never contains its content, and quoted code
 * would fall outside its quote. Grouping rebuilds that nesting for the renderer.
 */

import { HTML_MIXED_CONTENT_TAGS } from './parser.js'

// Attributes worth carrying over to the rendered wrapper. `style` and event
// handlers are deliberately absent (the sanitizer strips them too).
const ATTR_ALLOWLIST = new Set(['id', 'class', 'align', 'open', 'title', 'lang', 'dir'])

const ATTR_RE = /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

export function isWrapperTag(tagName) {
  return typeof tagName === 'string' && HTML_MIXED_CONTENT_TAGS.has(tagName.toLowerCase())
}

export function parseHtmlAttributes(openTag) {
  const inner = openTag.match(/^\s*<[a-zA-Z][a-zA-Z0-9]*([^>]*)>/)?.[1]
  if (!inner) { return {} }

  const props = {}
  ATTR_RE.lastIndex = 0
  let match
  while ((match = ATTR_RE.exec(inner)) !== null) {
    const name = match[1].toLowerCase()
    if (!ATTR_ALLOWLIST.has(name)) { continue }
    // `open` is a boolean attribute: present means on, whatever the value says
    if (name === 'open') {
      props.open = true
      continue
    }
    const value = match[2] ?? match[3] ?? match[4]
    if (value !== undefined) {
      props[name === 'class' ? 'className' : name] = value
    }
  }
  return props
}

/** Whether `block` sits somewhere inside the quote with `quoteId`, following `parentId` links. */
function isInQuote(block, quoteId, parentOf) {
  let parentId = block.parentId
  while (parentId) {
    if (parentId === quoteId) { return true }
    parentId = parentOf.get(parentId)
  }
  return false
}

/**
 * Turns the flat block list into a shallow tree of `{ kind: 'block', block }`,
 * `{ kind: 'wrapper', block, children }` and `{ kind: 'quote', block, children }`
 * nodes. A quote's children are the blocks whose `parentId` leads to it.
 * Unmatched markers stay plain blocks so a malformed document still renders.
 */
export function groupHtmlWrappers(blocks) {
  const root = []
  const stack = []
  const parentOf = new Map(blocks.map((block) => [block.id, block.parentId]))
  const top = () => stack[stack.length - 1]

  for (const block of blocks) {
    // A quote has no close marker: it ends at the first block outside it.
    while (top()?.kind === 'quote' && !isInQuote(block, top().block.id, parentOf)) { stack.pop() }
    const target = top()?.children ?? root

    if ((block.type === 'blockquote' || block.type === 'alert') && block.nested) {
      const node = { kind: 'quote', block, children: [] }
      target.push(node)
      stack.push(node)
      continue
    }

    if (block.type === 'html' && block.htmlRole === 'open' && isWrapperTag(block.htmlTag)) {
      const node = { kind: 'wrapper', block, children: [] }
      target.push(node)
      stack.push(node)
      continue
    }

    if (block.type === 'html' && block.htmlRole === 'close') {
      const openNode = top()
      if (openNode && openNode.block.htmlTag === block.htmlTag) {
        stack.pop()
        continue
      }
    }

    target.push({ kind: 'block', block })
  }

  return root
}
