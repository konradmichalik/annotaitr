import { findDisplayMath } from './math.js'

const HTML_BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'center', 'dd', 'details',
  'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup',
  'hr', 'iframe', 'main', 'menu', 'nav', 'ol', 'p', 'picture', 'pre',
  'section', 'source', 'summary', 'table', 'tbody', 'td', 'template',
  'tfoot', 'th', 'thead', 'tr', 'ul', 'video'
])

const HTML_VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
])

// HTML tags that can contain markdown content (e.g. <div align="center">)
export const HTML_MIXED_CONTENT_TAGS = new Set([
  'div', 'section', 'details', 'aside', 'article', 'figure', 'figcaption',
  'header', 'footer', 'main', 'nav', 'center'
])

const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/

/**
 * Gives blocks parsed from a nested chunk of lines their ids, order and source
 * lines in the whole file. Links to quotes inside the chunk follow the new ids,
 * top-level blocks of the chunk get `parentId` when one is given.
 */
function rebaseBlocks(inner, firstId, lineOffset, parentId) {
  const ids = new Map(inner.map((block, index) => [block.id, `block-${firstId + index}`]))
  return inner.map((block, index) => {
    const parent = block.parentId ? ids.get(block.parentId) : parentId
    return {
      ...block,
      id: ids.get(block.id),
      order: firstId + index + 1,
      startLine: lineOffset + block.startLine,
      ...(parent ? { parentId: parent } : {})
    }
  })
}

const NESTING_TYPES = new Set(['code', 'blockquote', 'alert', 'math'])

/**
 * Whether the parsed quote content holds real blocks. The block parser is
 * lenient (one `|` makes a table, `#123` a heading, `2024.` an ordered item),
 * so only unambiguous blocks count, and ordered items only as a list of two.
 */
function hasNestedBlocks(children, innerLines) {
  const items = children.filter((child) => child.type === 'list-item')
  const isOrdered = (item) => /^\d+\./.test(innerLines[item.startLine - 1].trim())
  return children.some((child) => NESTING_TYPES.has(child.type)) ||
    items.some((item) => !isOrdered(item)) ||
    items.length > 1
}

/**
 * A quote or GitHub alert. Text alone stays one block with inline text, as
 * always. Code, lists, quotes or formulas make it a `nested` container block
 * followed by its parsed child blocks, each pointing back to it with `parentId`.
 */
function parseQuote(quoteLines, startLine, firstId) {
  const stripped = quoteLines.map((quoteLine) => quoteLine.trim().replace(/^>\s*/, ''))
  const alertMatch = stripped[0].match(ALERT_MARKER)
  const kind = alertMatch ? { type: 'alert', alertType: alertMatch[1].toLowerCase() } : { type: 'blockquote' }
  const skip = alertMatch ? 1 : 0
  // Only one space or tab after `>` belongs to the quote, more is indentation of quoted code or lists.
  const innerLines = quoteLines.slice(skip).map((quoteLine) => quoteLine.trimStart().replace(/^>[ \t]?/, ''))
  const children = parseMarkdownToBlocks(innerLines.join('\n'), { allowFrontmatter: false })
  const id = `block-${firstId}`

  if (!hasNestedBlocks(children, innerLines)) {
    // An alert's text starts below its marker line, so its notes count lines from there.
    const textLine = quoteLines.length > skip ? startLine + skip : startLine
    return [{ id, ...kind, content: stripped.slice(skip).join('\n'), order: firstId + 1, startLine: textLine }]
  }
  return [
    { id, ...kind, content: '', nested: true, order: firstId + 1, startLine },
    ...rebaseBlocks(children, firstId + 1, startLine + skip - 1, id)
  ]
}

/**
 * Simplified markdown parser that splits content into linear blocks.
 * Designed for predictable text-anchoring (not AST-based).
 */
export function parseMarkdownToBlocks(markdown, { allowFrontmatter = true } = {}) {
  const lines = markdown.split('\n')
  const blocks = []
  let currentId = 0
  let buffer = []
  let currentType = 'paragraph'
  const currentLevel = 0
  let bufferStartLine = 1
  let startIndex = 0

  // YAML frontmatter: must start at line 0 with exactly '---'
  if (allowFrontmatter && lines[0]?.trim() === '---') {
    let closeIndex = -1
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].trim() === '---') {
        closeIndex = j
        break
      }
    }
    if (closeIndex > 1) {
      const fmLines = lines.slice(1, closeIndex)
      const entries = []
      for (const fmLine of fmLines) {
        // Indented lines are YAML continuations (block scalars, list items) —
        // fold them into the preceding key rather than treating them as new entries.
        if (/^\s/.test(fmLine) && fmLine.trim() !== '' && entries.length > 0) {
          const last = entries[entries.length - 1]
          const trimmed = fmLine.trim()
          const isListItem = trimmed.startsWith('- ')
          const item = isListItem ? trimmed.slice(2).trim() : trimmed
          const sep = isListItem ? ', ' : ' '
          last.value = last.value ? `${last.value}${sep}${item}` : item
          continue
        }
        const colonIdx = fmLine.indexOf(':')
        if (colonIdx <= 0) {continue}
        let value = fmLine.slice(colonIdx + 1).trim()
        // Strip bare YAML block scalar indicators (|, >, |-, >+, |2, >2-, ...) —
        // the actual text follows on continuation lines.
        if (/^[|>](?:[+-][1-9]?|[1-9][+-]?)?$/.test(value)) {value = ''}
        entries.push({ key: fmLine.slice(0, colonIdx).trim(), value })
      }
      if (entries.length > 0) {
        blocks.push({
          id: `block-${currentId++}`,
          type: 'frontmatter',
          content: fmLines.join('\n'),
          entries,
          order: currentId,
          startLine: 1
        })
        startIndex = closeIndex + 1
      }
    }
  }

  const flush = () => {
    if (buffer.length > 0) {
      const content = buffer.join('\n')
      blocks.push({
        id: `block-${currentId++}`,
        type: currentType,
        content,
        level: currentLevel,
        order: currentId,
        startLine: bufferStartLine
      })
      buffer = []
    }
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const currentLineNum = i + 1

    // Headings
    if (trimmed.startsWith('#')) {
      flush()
      const level = trimmed.match(/^#+/)?.[0].length || 1
      blocks.push({
        id: `block-${currentId++}`,
        type: 'heading',
        content: trimmed.replace(/^#+\s*/, ''),
        level,
        order: currentId,
        startLine: currentLineNum
      })
      continue
    }

    // Display math: $$…$$ or \[…\]. An unterminated delimiter falls through to
    // normal parsing so the rest of the document keeps its structure.
    const displayMath = findDisplayMath(lines, i)
    if (displayMath) {
      flush()
      blocks.push({
        id: `block-${currentId++}`,
        type: 'math',
        content: displayMath.formula,
        order: currentId,
        startLine: currentLineNum
      })
      i = displayMath.endIndex
      continue
    }

    // Horizontal Rule
    if (/^([-*_])\s*(\1\s*){2,}$/.test(trimmed)) {
      flush()
      blocks.push({
        id: `block-${currentId++}`,
        type: 'hr',
        content: '',
        order: currentId,
        startLine: currentLineNum
      })
      continue
    }

    // List Items
    if (trimmed.match(/^(\*|-|\d+\.)\s/)) {
      flush()
      const leadingWhitespace = line.match(/^(\s*)/)?.[1] || ''
      const spaceCount = leadingWhitespace.replace(/\t/g, '  ').length
      const listLevel = Math.floor(spaceCount / 2)

      let content = trimmed.replace(/^(\*|-|\d+\.)\s/, '')

      let checked = undefined
      const checkboxMatch = content.match(/^\[([ xX])\]\s*/)
      if (checkboxMatch) {
        checked = checkboxMatch[1].toLowerCase() === 'x'
        content = content.replace(/^\[([ xX])\]\s*/, '')
      }

      // Collect continuation lines (indented, no list marker, not blank)
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1]
        const nextTrimmed = nextLine.trim()
        if (nextTrimmed === '') { break }
        if (nextTrimmed.match(/^(\*|-|\d+\.)\s/)) { break }
        const nextLeading = nextLine.match(/^(\s*)/)?.[1] || ''
        const nextSpaces = nextLeading.replace(/\t/g, '  ').length
        if (nextSpaces < 2) { break }
        i++
        content += '\n' + nextTrimmed
      }

      blocks.push({
        id: `block-${currentId++}`,
        type: 'list-item',
        content,
        level: listLevel,
        checked,
        order: currentId,
        startLine: currentLineNum
      })
      continue
    }

    // Blockquotes & GitHub alerts
    if (trimmed.startsWith('>')) {
      flush()
      const quoteLines = [line]
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('>')) {
        i++
        quoteLines.push(lines[i])
      }
      const quoteBlocks = parseQuote(quoteLines, currentLineNum, currentId)
      blocks.push(...quoteBlocks)
      currentId += quoteBlocks.length
      continue
    }

    // Code blocks (supports nested fences per CommonMark: closing fence must have >= opening backtick count)
    const fenceMatch = trimmed.match(/^(`{3,})/)
    if (fenceMatch) {
      flush()
      const codeStartLine = currentLineNum
      const fenceLen = fenceMatch[1].length
      const language = trimmed.slice(fenceLen).trim() || undefined
      const closingPattern = new RegExp(`^\`{${fenceLen},}$`)
      const codeContent = []
      i++
      while (i < lines.length && !closingPattern.test(lines[i].trim())) {
        codeContent.push(lines[i])
        i++
      }
      blocks.push({
        id: `block-${currentId++}`,
        type: 'code',
        content: codeContent.join('\n'),
        language,
        order: currentId,
        startLine: codeStartLine
      })
      continue
    }

    // Tables
    if (trimmed.startsWith('|') || (trimmed.includes('|') && trimmed.match(/^\|?.+\|.+\|?$/))) {
      flush()
      const tableStartLine = currentLineNum
      const tableLines = [line]

      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim()
        if (nextLine.startsWith('|') || (nextLine.includes('|') && nextLine.match(/^\|?.+\|.+\|?$/))) {
          i++
          tableLines.push(lines[i])
        } else {
          break
        }
      }

      blocks.push({
        id: `block-${currentId++}`,
        type: 'table',
        content: tableLines.join('\n'),
        order: currentId,
        startLine: tableStartLine
      })
      continue
    }

    // HTML blocks
    if (trimmed.startsWith('<')) {
      // HTML comments
      if (trimmed.startsWith('<!--')) {
        flush()
        const htmlStartLine = currentLineNum
        const htmlLines = [line]
        if (!trimmed.includes('-->')) {
          i++
          while (i < lines.length) {
            htmlLines.push(lines[i])
            if (lines[i].includes('-->')) { break }
            i++
          }
        }
        blocks.push({
          id: `block-${currentId++}`,
          type: 'html',
          content: htmlLines.join('\n'),
          order: currentId,
          startLine: htmlStartLine
        })
        continue
      }

      // Block-level HTML tags
      const tagMatch = trimmed.match(/^<([a-zA-Z][a-zA-Z0-9]*)[\s>/]/)
      if (tagMatch && HTML_BLOCK_TAGS.has(tagMatch[1].toLowerCase())) {
        flush()
        const tagName = tagMatch[1].toLowerCase()
        const htmlStartLine = currentLineNum

        const isSelfClosing = trimmed.endsWith('/>')
        const isVoid = HTML_VOID_TAGS.has(tagName)
        const hasSameLineClose = new RegExp(`</${tagName}\\s*>`, 'i').test(trimmed)

        if (!isSelfClosing && !isVoid && !hasSameLineClose && HTML_MIXED_CONTENT_TAGS.has(tagName)) {
          // Mixed content wrapper: split into open tag + inner markdown + close tag
          const closePattern = new RegExp(`</${tagName}\\s*>`, 'i')
          const openPattern = new RegExp(`<${tagName}[\\s>/]`, 'i')
          const openTag = line.match(new RegExp(`^\\s*<${tagName}(?:\\s[^>]*)?>`, 'i'))?.[0] ?? line
          const innerLines = []
          const trailing = line.slice(openTag.length)
          if (trailing.trim()) { innerLines.push(trailing) }
          // Content sharing the opening line belongs to that same line number
          const innerLineOffset = innerLines.length > 0 ? htmlStartLine - 1 : htmlStartLine
          let closingLine = null
          let closingLineNum = null
          let afterClose = ''
          let depth = 1
          i++
          while (i < lines.length) {
            if (openPattern.test(lines[i].trim())) { depth++ }
            if (closePattern.test(lines[i].trim())) {
              depth--
              if (depth === 0) {
                const closeMatch = lines[i].match(closePattern)
                const prefix = lines[i].slice(0, closeMatch.index)
                if (prefix.trim()) { innerLines.push(prefix) }
                closingLine = closeMatch[0]
                afterClose = lines[i].slice(closeMatch.index + closeMatch[0].length)
                closingLineNum = i + 1
                break
              }
            }
            innerLines.push(lines[i])
            i++
          }

          // Emit opening tag. A balanced wrapper carries open/close roles so the
          // renderer can nest the inner blocks inside a real element.
          blocks.push({
            id: `block-${currentId++}`,
            type: 'html',
            content: openTag,
            order: currentId,
            startLine: htmlStartLine,
            ...(closingLine ? { htmlTag: tagName, htmlRole: 'open' } : {})
          })
          // Recursively parse inner content as markdown
          const innerBlocks = rebaseBlocks(parseMarkdownToBlocks(innerLines.join('\n'), { allowFrontmatter: false }), currentId, innerLineOffset)
          blocks.push(...innerBlocks)
          currentId += innerBlocks.length
          // Emit closing tag
          if (closingLine) {
            blocks.push({
              id: `block-${currentId++}`,
              type: 'html',
              content: closingLine,
              order: currentId,
              startLine: closingLineNum,
              htmlTag: tagName,
              htmlRole: 'close'
            })
            // Content trailing the closing tag belongs after the wrapper, on that same line
            if (afterClose.trim()) {
              const afterBlocks = rebaseBlocks(parseMarkdownToBlocks(afterClose, { allowFrontmatter: false }), currentId, closingLineNum - 1)
              blocks.push(...afterBlocks)
              currentId += afterBlocks.length
            }
          }
          continue
        }

        // <summary> is an accordion label: keep only its inner markdown so it can
        // render as a real <summary> child of <details>.
        if (tagName === 'summary' && hasSameLineClose) {
          const summaryInner = trimmed.match(/^<summary(?:\s[^>]*)?>([\s\S]*)<\/summary\s*>$/i)
          if (summaryInner) {
            blocks.push({
              id: `block-${currentId++}`,
              type: 'html',
              content: summaryInner[1].trim(),
              order: currentId,
              startLine: htmlStartLine,
              htmlTag: 'summary',
              htmlRole: 'summary'
            })
            continue
          }
        }

        // Non-mixed HTML: collect everything as one opaque block
        const htmlLines = [line]
        if (!isSelfClosing && !isVoid && !hasSameLineClose) {
          const closePattern = new RegExp(`</${tagName}\\s*>`, 'i')
          const openPattern = new RegExp(`<${tagName}[\\s>/]`, 'i')
          let depth = 1
          i++
          while (i < lines.length) {
            htmlLines.push(lines[i])
            if (openPattern.test(lines[i])) { depth++ }
            if (closePattern.test(lines[i])) {
              depth--
              if (depth === 0) { break }
            }
            i++
          }
        }

        blocks.push({
          id: `block-${currentId++}`,
          type: 'html',
          content: htmlLines.join('\n'),
          order: currentId,
          startLine: htmlStartLine
        })
        continue
      }
    }

    // Empty lines separate paragraphs
    if (trimmed === '') {
      flush()
      currentType = 'paragraph'
      continue
    }

    // Accumulate paragraph text
    if (buffer.length === 0) {
      bufferStartLine = currentLineNum
    }
    buffer.push(line)
  }

  flush()
  return blocks
}
