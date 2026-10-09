import { useState, useRef, useEffect, useCallback } from 'react'
import hljs from 'highlight.js'
import { countDiffLines, parseDiffLines, splitCodeInfo } from '../../utils/diffLines.js'

/**
 * Compute the character offset of a token span within the code block's text content.
 */
function getTokenOffset(codeEl, tokenSpan) {
  const range = document.createRange()
  range.selectNodeContents(codeEl)
  range.setEnd(tokenSpan, 0)
  return range.toString().length
}

/**
 * A unified diff with old and new line numbers. The numbers come from CSS on
 * empty gutter spans, so the text of the block stays exactly the fenced source
 * and selections, quotes and restored highlights match it character for character.
 */
function DiffCode({ lines }) {
  return lines.map((line, i) => [
    i > 0 && '\n',
    <span key={i} className={`diff-line diff-${line.kind}`}>
      <span className="diff-gutter" data-old={line.oldNo ?? ''} data-new={line.newNo ?? ''} aria-hidden="true" />
      {line.text}
    </span>
  ])
}

function DiffHeader({ path, counts }) {
  return (
    <div className="diff-header">
      {path && <span className="diff-path">{path}</span>}
      <span className="diff-counts">
        <span className="diff-count-add">+{counts.added}</span>{' '}
        <span className="diff-count-del">{'\u2212'}{counts.removed}</span>
      </span>
    </div>
  )
}

export function CodeBlock({ block, onHover, onLeave, isHovered, hasNote, onNoteClick, onTokenSelect }) {
  const { language, meta } = splitCodeInfo(block.language)
  const isDiff = language === 'diff'
  const diffLines = isDiff ? parseDiffLines(block.content) : null
  const [copied, setCopied] = useState(false)
  const containerRef = useRef(null)
  const codeRef = useRef(null)
  const copyTimerRef = useRef(null)

  useEffect(() => {
    if (codeRef.current && !isDiff) {
      codeRef.current.removeAttribute('data-highlighted')
      codeRef.current.className = `hljs${language ? ` language-${language}` : ''}`
      hljs.highlightElement(codeRef.current)
    }
  }, [block.content, language, isDiff])

  useEffect(() => {
    return () => { if (copyTimerRef.current) { clearTimeout(copyTimerRef.current) } }
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(block.content)
      setCopied(true)
      if (copyTimerRef.current) { clearTimeout(copyTimerRef.current) }
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (_err) {
      // ignore
    }
  }, [block.content])

  const handleCodeClick = useCallback((e) => {
    if (!onTokenSelect) { return }
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) { return }

    const span = e.target.closest('.hljs span')
    if (!span || !codeRef.current?.contains(span)) { return }

    e.stopPropagation()
    const tokenText = span.textContent
    if (!tokenText.trim()) { return }

    const charStart = getTokenOffset(codeRef.current, span)
    onTokenSelect({
      blockId: block.id,
      element: span,
      tokenText,
      charStart,
      charEnd: charStart + tokenText.length,
    })
  }, [onTokenSelect, block.id])

  return (
    <div
      ref={containerRef}
      className={`block-code-wrapper${isDiff ? ' block-diff-wrapper' : ''}${isHovered ? ' hovered' : ''}${hasNote ? ' block-has-note' : ''}`}
      data-block-id={block.id}
      onMouseEnter={() => onHover?.(containerRef.current)}
      onMouseLeave={() => onLeave?.()}
    >
      {hasNote && (
        <span
          className="block-note-border"
          onClick={(e) => { e.stopPropagation(); onNoteClick?.(block.id) }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onNoteClick?.(block.id) } }}
          title="AI Note — click to view"
          role="button"
          tabIndex={0}
          aria-label="View AI note"
        />
      )}
      {isDiff && <DiffHeader path={meta} counts={countDiffLines(diffLines)} />}
      <div className="code-toolbar">
        {language && !isDiff && <span className="code-language-label">{language}</span>}
        <button
          onClick={handleCopy}
          className="code-copy-btn"
          title={copied ? 'Copied!' : 'Copy code'}
          aria-label={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? '\u2713' : '\u2398'}
        </button>
      </div>
      {isDiff ? (
        <pre className="block-code block-diff">
          <code ref={codeRef}><DiffCode lines={diffLines} /></code>
        </pre>
      ) : (
        <pre className="block-code token-selectable">
          <code
            ref={codeRef}
            className={`hljs${language ? ` language-${language}` : ''}`}
            onClick={handleCodeClick}
          >
            {block.content}
          </code>
        </pre>
      )}
    </div>
  )
}
