import { useRef, useEffect } from 'react'
import { sanitizeHTML } from '../../utils/sanitize.js'
import { isWrapperTag, parseHtmlAttributes } from '../../utils/htmlWrappers.js'
import { InlineMarkdown } from './InlineMarkdown.jsx'
import { TableToolbar } from './TableToolbar.jsx'

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function parseTableContent(content) {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length === 0) {return { headers: [], rows: [] }}

  const parseRow = (line) =>
    line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())

  const headers = parseRow(lines[0])
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (/^[|\-:\s]+$/.test(line)) {continue}
    rows.push(parseRow(line))
  }

  return { headers, rows }
}

export function NoteBorder({ blockId, onClick }) {
  return (
    <span
      className="block-note-border"
      onClick={(e) => { e.stopPropagation(); onClick(blockId) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick(blockId) } }}
      title="AI Note — click to view"
      role="button"
      tabIndex={0}
      aria-label="View AI note"
    />
  )
}

function AlertIcon({ type }) {
  const props = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'currentColor' }
  switch (type) {
    case 'note':
      return <svg {...props}><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>
    case 'tip':
      return <svg {...props}><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/></svg>
    case 'important':
      return <svg {...props}><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>
    case 'warning':
      return <svg {...props}><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>
    case 'caution':
      return <svg {...props}><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>
    default:
      return null
  }
}

function HtmlBlock({ block, noteClass }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = sanitizeHTML(block.content)
    }
  }, [block.content])
  return <div ref={ref} className={`block-html${noteClass}`} data-block-id={block.id} />
}

/**
 * Renders a balanced HTML wrapper (<details>, <div align="center">, …) as a real
 * element around its inner blocks, so nesting-dependent elements keep working.
 */
export function HtmlWrapper({ block, noteClass = '', children }) {
  const Tag = isWrapperTag(block.htmlTag) ? block.htmlTag : 'div'
  const { className, ...attrs } = parseHtmlAttributes(block.content)
  return (
    <Tag
      {...attrs}
      className={`block-html-wrapper block-html-${Tag}${className ? ` ${className}` : ''}${noteClass}`}
      data-block-id={block.id}
    >
      {children}
    </Tag>
  )
}

/** `earlier` renders a block of a past round: a heading keeps its look but neither its role nor its anchor id. */
export function BlockRenderer({ block, onImageClick, onTableAnnotate, annotatedImages, hasNote, onNoteClick, earlier = false, children }) {
  const noteClass = hasNote ? ' block-has-note' : ''
  // A quote with nested blocks renders its child blocks, a plain quote its own text.
  const quoteBody = block.nested
    ? children
    : <InlineMarkdown text={block.content} onImageClick={onImageClick} annotatedImages={annotatedImages} blockId={block.id} />

  switch (block.type) {
    case 'heading': {
      const Tag = earlier ? 'p' : `h${block.level || 1}`
      return (
        <Tag id={earlier ? undefined : slugify(block.content)} className={`heading heading-${block.level || 1}${noteClass}`} data-block-id={block.id}>
          {hasNote && <NoteBorder blockId={block.id} onClick={onNoteClick} />}
          <InlineMarkdown text={block.content} onImageClick={onImageClick} annotatedImages={annotatedImages} blockId={block.id} />
        </Tag>
      )
    }

    case 'blockquote':
      return (
        <blockquote className={`block-blockquote${block.nested ? ' block-blockquote--nested' : ''}${noteClass}`} data-block-id={block.id}>
          {hasNote && <NoteBorder blockId={block.id} onClick={onNoteClick} />}
          {quoteBody}
        </blockquote>
      )

    case 'alert':
      return (
        <div className={`block-alert block-alert--${block.alertType}${block.nested ? ' block-alert--nested' : ''}${noteClass}`} data-block-id={block.id}>
          {hasNote && <NoteBorder blockId={block.id} onClick={onNoteClick} />}
          <span className="block-alert-title">
            <AlertIcon type={block.alertType} />
            {block.alertType.charAt(0).toUpperCase() + block.alertType.slice(1)}
          </span>
          {quoteBody}
        </div>
      )

    case 'list-item': {
      const indent = (block.level || 0) * 1.25
      const isCheckbox = block.checked !== undefined
      const bullets = ['\u2022', '\u25E6', '\u25AA']
      const bullet = bullets[Math.min(block.level || 0, 2)]
      return (
        <div className={`block-list-item${noteClass}`} data-block-id={block.id} style={{ marginLeft: `${indent}rem` }}>
          {hasNote && <NoteBorder blockId={block.id} onClick={onNoteClick} />}
          <span className="list-marker">
            {isCheckbox
              ? (block.checked ? '\u2611' : '\u2610')
              : bullet}
          </span>
          <span className={isCheckbox && block.checked ? 'checked-text' : ''}>
            <InlineMarkdown text={block.content} onImageClick={onImageClick} annotatedImages={annotatedImages} blockId={block.id} />
          </span>
        </div>
      )
    }

    case 'table': {
      const { headers, rows } = parseTableContent(block.content)
      return (
        <div className={`block-table-wrapper${noteClass}`} data-block-id={block.id}>
          {hasNote && <NoteBorder blockId={block.id} onClick={onNoteClick} />}
          <TableToolbar headers={headers} rows={rows} onAnnotate={onTableAnnotate ? (e) => onTableAnnotate({ blockId: block.id, content: block.content, element: e.currentTarget.closest('.block-table-wrapper') }) : undefined} />
          <table className="block-table">
            <thead>
              <tr>
                {headers.map((header, i) => (
                  <th key={i}><InlineMarkdown text={header} onImageClick={onImageClick} annotatedImages={annotatedImages} blockId={block.id} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx}><InlineMarkdown text={cell} onImageClick={onImageClick} annotatedImages={annotatedImages} blockId={block.id} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'html':
      // The <summary> of an accordion must stay a direct child of its <details>
      if (block.htmlRole === 'summary') {
        return (
          <summary className={`block-html-summary${noteClass}`} data-block-id={block.id}>
            {hasNote && <NoteBorder blockId={block.id} onClick={onNoteClick} />}
            <InlineMarkdown text={block.content} onImageClick={onImageClick} annotatedImages={annotatedImages} blockId={block.id} />
          </summary>
        )
      }
      return (
        <HtmlBlock block={block} noteClass={noteClass} />
      )

    case 'frontmatter':
      return (
        <div className={`block-frontmatter${noteClass}`} data-block-id={block.id}>
          {hasNote && <NoteBorder blockId={block.id} onClick={onNoteClick} />}
          <dl>
            {block.entries.map((entry, i) => (
              <div key={i} className="frontmatter-entry">
                <dt>{entry.key}</dt>
                <dd>{entry.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )

    case 'hr':
      return <hr className={`block-hr${noteClass}`} data-block-id={block.id} />

    default:
      return (
        <p className={`block-paragraph${noteClass}`} data-block-id={block.id}>
          {hasNote && <NoteBorder blockId={block.id} onClick={onNoteClick} />}
          <InlineMarkdown text={block.content} onImageClick={onImageClick} annotatedImages={annotatedImages} blockId={block.id} />
        </p>
      )
  }
}
