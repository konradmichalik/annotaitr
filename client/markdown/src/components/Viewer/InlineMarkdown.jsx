import { useContext } from 'react'
import { sanitizeHTML } from '../../utils/sanitize.js'
import { matchInlineMath } from '../../utils/math.js'
import { renderMath } from '../../utils/renderMath.js'
import { FileRefsContext } from './fileRefsContext.js'
import { FileLineRef } from './FileLineRef.jsx'

const EMOJI_MAP = {
  'wave': '👋', 'rocket': '🚀', 'warning': '⚠️', 'check': '✅',
  'x': '❌', 'star': '⭐', 'fire': '🔥', 'bug': '🐛',
  'sparkles': '✨', 'tada': '🎉', 'thumbsup': '👍', 'thumbsdown': '👎',
  'heart': '❤️', 'eyes': '👀', 'thinking': '🤔', 'clap': '👏',
  'pray': '🙏', 'muscle': '💪', 'bulb': '💡', 'memo': '📝',
  'link': '🔗', 'lock': '🔒', 'unlock': '🔓', 'key': '🔑',
  'hammer': '🔨', 'wrench': '🔧', 'gear': '⚙️', 'shield': '🛡️',
  'zap': '⚡', 'package': '📦',
  '+1': '👍', '-1': '👎',
  'white_check_mark': '✅', 'heavy_check_mark': '✔️',
  'arrow_right': '→', 'arrow_left': '←', 'arrow_up': '↑', 'arrow_down': '↓',
  'point_right': '👉', 'point_left': '👈',
  'construction': '🚧', 'rotating_light': '🚨',
  'clipboard': '📋', 'pushpin': '📌', 'bookmark': '🔖',
  'calendar': '📅', 'clock': '🕐', 'hourglass': '⏳',
  'chart_with_upwards_trend': '📈', 'chart_with_downwards_trend': '📉',
  'green_circle': '🟢', 'red_circle': '🔴', 'yellow_circle': '🟡', 'blue_circle': '🔵',
  'question': '❓', 'exclamation': '❗', 'info': 'ℹ️',
}

const AUTOLINK_RE = /(https?:\/\/[^\s<>[\]()]*[^\s<>[\]().,;:!?'")\]}>]|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g

function splitAutolinks(text) {
  const parts = []
  let lastIndex = 0
  AUTOLINK_RE.lastIndex = 0
  let m
  while ((m = AUTOLINK_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, m.index) })
    }
    parts.push({ type: m[1].includes('@') ? 'email' : 'url', value: m[1] })
    lastIndex = AUTOLINK_RE.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return parts
}

function smartPunctuation(text) {
  return text
    .replace(/---/g, '\u2014')
    .replace(/--/g, '\u2013')
    .replace(/\.\.\./g, '\u2026')
    .replace(/"([^"]*?)"/g, '\u201C$1\u201D')
    .replace(/'([^']*?)'/g, '\u2018$1\u2019')
}

// Scheme allowlist for <a href>. The final `[^:]*$` alternative matches any string
// that contains no colon at all (bare filenames, query-only, etc.), since those
// can't encode a dangerous scheme. Anything else (javascript:, data:, vbscript:,
// file:, …) is rejected.
const SAFE_LINK_SCHEMES = /^(https?:|mailto:|tel:|#|\/|\.\.?\/|[^:]*$)/i

// Image sources additionally allow data:image/* (common legitimate inline images).
const SAFE_IMG_SCHEMES = /^(https?:|data:image\/|#|\/|\.\.?\/|[^:]*$)/i

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

// Strip control chars (e.g. "java\tscript:") before scheme check; they would otherwise
// let attackers slip past the allowlist in some parsers.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g

function isSafeLinkHref(href) {
  if (typeof href !== 'string') { return false }
  const stripped = href.replace(CONTROL_CHARS, '').trimStart()
  return SAFE_LINK_SCHEMES.test(stripped)
}

function isSafeImageSrc(src) {
  if (typeof src !== 'string') { return false }
  const stripped = src.replace(CONTROL_CHARS, '').trimStart()
  return SAFE_IMG_SCHEMES.test(stripped)
}

function handleAnchorClick(e, href) {
  if (!href.startsWith('#') || href.length === 1) { return }
  const viewerEl = e.target.closest('.viewer-container')
  if (!viewerEl) { return }
  const targetEl = document.getElementById(href.slice(1))
  if (targetEl && viewerEl.contains(targetEl)) {
    e.preventDefault()
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

export function InlineMarkdown({ text, onImageClick, annotatedImages, blockId }) {
  const fileRefs = useContext(FileRefsContext)
  const parts = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Hard line breaks: two+ trailing spaces or backslash before newline
    let match = remaining.match(/^(.*?)(?:  +|\\)\n/)
    if (match) {
      if (match[1]) {
        parts.push(<InlineMarkdown key={key++} text={match[1]} onImageClick={onImageClick} annotatedImages={annotatedImages} blockId={blockId} />)
      }
      parts.push(<br key={key++} />)
      remaining = remaining.slice(match[0].length)
      continue
    }

    match = remaining.match(/^\*\*(.+?)\*\*/)
    if (match) {
      parts.push(<strong key={key++}>{match[1]}</strong>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    match = remaining.match(/^\*(.+?)\*/)
    if (match) {
      parts.push(<em key={key++}>{match[1]}</em>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    match = remaining.match(/^~~(.+?)~~/)
    if (match) {
      parts.push(<del key={key++}><InlineMarkdown text={match[1]} onImageClick={onImageClick} annotatedImages={annotatedImages} blockId={blockId} /></del>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Inline math: $…$ or \(…\) — guarded against dollar amounts
    const mathMatch = matchInlineMath(remaining)
    if (mathMatch) {
      const rendered = renderMath(mathMatch.formula, mathMatch.display)
      if (rendered.error) {
        parts.push(<code key={key++} className="inline-math-error" title={rendered.error}>{mathMatch.raw}</code>)
      } else {
        parts.push(
          <span
            key={key++}
            className="inline-math"
            aria-label={`Formula: ${mathMatch.formula}`}
            dangerouslySetInnerHTML={{ __html: rendered.html }}
          />
        )
      }
      remaining = remaining.slice(mathMatch.raw.length)
      continue
    }

    match = remaining.match(/^`([^`]+)`/)
    if (match) {
      const codeText = match[1]
      const codeRef = fileRefs?.find(codeText)
      if (codeRef?.index === 0 && codeRef.length === codeText.length) {
        parts.push(<FileLineRef key={key++} reference={codeRef} label={codeText} code />)
        remaining = remaining.slice(match[0].length)
        continue
      }
      const isHexColor = HEX_COLOR_RE.test(codeText)
      parts.push(
        <code key={key++} className="inline-code">
          {isHexColor && <span className="color-swatch" style={{ backgroundColor: codeText }} aria-hidden="true" />}
          {codeText}
        </code>
      )
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Images: ![alt](url)
    match = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/)
    if (match) {
      const imgAlt = match[1]
      const imgSrc = match[2]
      // Unsafe image src (javascript:, non-image data:, etc.) → render alt text as plain string.
      if (!isSafeImageSrc(imgSrc)) {
        parts.push(imgAlt || '')
        remaining = remaining.slice(match[0].length)
        continue
      }
      // Without a handler the image is only shown, as in the read-only changes view.
      if (!onImageClick) {
        parts.push(<img key={key++} src={imgSrc} alt={imgAlt} className="inline-image" />)
        remaining = remaining.slice(match[0].length)
        continue
      }
      const annotationType = annotatedImages?.get(`${blockId}::${imgSrc}`)
      const annClass = annotationType === 'DELETION' ? ' annotated-deletion' : annotationType ? ' annotated-comment' : ''
      parts.push(
        <span
          key={key++}
          className={`annotatable-image-wrapper${annClass}`}
          data-image-src={imgSrc}
          role="button"
          tabIndex={0}
          aria-label={imgAlt ? `Annotate image: ${imgAlt}` : 'Annotate image'}
          onClick={(e) => {
            e.stopPropagation()
            onImageClick({ alt: imgAlt, src: imgSrc, blockId, element: e.currentTarget })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onImageClick({ alt: imgAlt, src: imgSrc, blockId, element: e.currentTarget })
            }
          }}
        >
          <img src={imgSrc} alt={imgAlt} className="inline-image annotatable-image" />
        </span>
      )
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Links: [text](url) — the text may contain one level of nested brackets, which
    // covers badge patterns ([![alt](img)](url)) as well as code spans holding
    // brackets (`#[Route]`, `items[0]`).
    match = remaining.match(/^\[((?:[^[\]]|\[[^[\]]*\])+)\]\(([^)]+)\)/)
    if (match) {
      const href = match[2]
      // Unsafe hrefs (javascript:, data:, vbscript:, …) → drop the <a> wrapper,
      // keep the link text so the document stays readable.
      if (!isSafeLinkHref(href)) {
        parts.push(<InlineMarkdown key={key++} text={match[1]} onImageClick={onImageClick} annotatedImages={annotatedImages} blockId={blockId} />)
        remaining = remaining.slice(match[0].length)
        continue
      }
      const isAnchor = href.startsWith('#')
      const isExternal = href.startsWith('http://') || href.startsWith('https://')
      // Badge pattern: [![alt](img)](url) — render as plain <a><img/></a> without annotation wrapper.
      // Unsafe badge image → fall back to alt text only.
      const badgeMatch = match[1].match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
      let linkContent
      if (badgeMatch) {
        linkContent = isSafeImageSrc(badgeMatch[2])
          ? <img src={badgeMatch[2]} alt={badgeMatch[1]} className="inline-image" />
          : <>{badgeMatch[1] || ''}</>
      } else {
        // A button inside a link would be two controls in one.
        linkContent = (
          <FileRefsContext.Provider value={null}>
            <InlineMarkdown text={match[1]} onImageClick={onImageClick} annotatedImages={annotatedImages} blockId={blockId} />
          </FileRefsContext.Provider>
        )
      }
      if (isAnchor) {
        parts.push(<a key={key++} href={href} onClick={(e) => handleAnchorClick(e, href)}>{linkContent}</a>)
      } else if (isExternal) {
        parts.push(
          <a key={key++} href={href} data-href={href} onClick={(e) => e.preventDefault()} className="external-link">
            {linkContent}
            <svg className="external-link-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )
      } else {
        parts.push(<a key={key++} href={href} data-href={href} onClick={(e) => e.preventDefault()}>{linkContent}</a>)
      }
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Inline HTML tags: <img>, <sup>, <sub>, <br>, <em>, <strong>, etc.
    match = remaining.match(/^<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*\/?>/)
    if (match) {
      const htmlTag = match[0]
      const tagName = match[1].toLowerCase()
      // Self-closing or void tags — render directly
      if (htmlTag.endsWith('/>') || ['img', 'br', 'hr', 'input', 'wbr'].includes(tagName)) {
        parts.push(<span key={key++} dangerouslySetInnerHTML={{ __html: sanitizeHTML(htmlTag) }} />)
        remaining = remaining.slice(htmlTag.length)
        continue
      }
      // Paired inline tags like <sup>...</sup>
      const closeIdx = remaining.indexOf(`</${tagName}>`, htmlTag.length)
      if (closeIdx !== -1) {
        const fullTag = remaining.slice(0, closeIdx + tagName.length + 3)
        parts.push(<span key={key++} dangerouslySetInnerHTML={{ __html: sanitizeHTML(fullTag) }} />)
        remaining = remaining.slice(fullTag.length)
        continue
      }
    }

    // Emoji shortcodes: :name: → emoji
    match = remaining.match(/^:([a-z0-9_+-]+):/)
    if (match && EMOJI_MAP[match[1]]) {
      parts.push(<span key={key++} className="emoji" role="img" aria-label={match[1]}>{EMOJI_MAP[match[1]]}</span>)
      remaining = remaining.slice(match[0].length)
      continue
    }

    // Plain text fallback: extract until next special char, then post-process
    // for autolinks (URLs, emails) and smart punctuation.
    // Break on markdown special chars or ':' only when NOT followed by '//' (URL scheme)
    const fileRef = fileRefs?.find(remaining)
    if (fileRef?.index === 0) {
      parts.push(<FileLineRef key={key++} reference={fileRef} label={remaining.slice(0, fileRef.length)} />)
      remaining = remaining.slice(fileRef.length)
      continue
    }
    let nextSpecial = remaining.slice(1).search(/[*`![<~$]|\\[([]|:(?!\/{2})/)
    // A path:line is cut out whole: its own colon would split it otherwise.
    if (fileRef && (nextSpecial === -1 || fileRef.index - 1 < nextSpecial)) { nextSpecial = fileRef.index - 1 }
    const plainText = nextSpecial === -1 ? remaining : remaining.slice(0, nextSpecial + 1)
    for (const seg of splitAutolinks(plainText)) {
      if (seg.type === 'url') {
        parts.push(<a key={key++} href={seg.value} target="_blank" rel="noopener noreferrer" className="autolink">{seg.value}</a>)
      } else if (seg.type === 'email') {
        parts.push(<a key={key++} href={`mailto:${seg.value}`} className="autolink">{seg.value}</a>)
      } else {
        parts.push(smartPunctuation(seg.value))
      }
    }
    if (nextSpecial === -1) {
      break
    } else {
      remaining = remaining.slice(nextSpecial + 1)
    }
  }

  return <>{parts}</>
}
