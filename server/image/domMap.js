/**
 * A compact map of the visible, meaningful elements of a captured page, so
 * image-mode feedback can name the element under each annotation instead of
 * leaving the agent to guess from pixels. Playwright-free on purpose: only
 * collectRawElements runs in the page, everything else is plain Node.
 */

export const MAX_ELEMENTS = 2000
const MAX_NAME_LENGTH = 80
const MAX_ANCESTORS = 3

const INTERACTIVE_OR_MEDIA = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'img', 'picture', 'video', 'svg', 'canvas', 'iframe'
])
// Their text content is everything nested inside, which names nothing.
export const CONTAINERS = new Set(['nav', 'header', 'footer', 'main', 'section', 'article', 'aside', 'form'])
// Longer ids and classes are almost always generated (CSS modules, hashes)
// and make the selector unreadable without making it more findable.
const IDENTIFIER = /^[A-Za-z][\w-]{0,29}$/
// Plain divs only stand in for cards and panels when nothing more specific
// is under a mark; tiny ones are layout wrappers, not panels.
// Divs with a role, label or title are already candidates.
export const PANEL_CANDIDATES = 'div:is([id], [class]):not([role], [aria-label], [title], svg *)'
export const MIN_PANEL_SIDE = 40
// The parts of an inline SVG are drawing primitives, not elements to name.
export const CANDIDATES = ':is(a, button, input, select, textarea, label, img, picture, video, svg, canvas, iframe, '
  + 'h1, h2, h3, h4, h5, h6, p, li, td, th, figcaption, blockquote, '
  + 'nav, header, footer, main, section, article, aside, form, [role], [aria-label], [title]):not(svg *)'

/**
 * Runs inside the captured page via page.evaluate, so it must stay
 * self-contained. It only reads raw values; the page is untrusted, so all
 * cleaning and capping happens again in normalizeDomMap.
 */
export function collectRawElements({ candidates: selector, fallbacks, minPanelSide, limit, containers, viewportOnly = false }) {
  const containerTags = new Set(containers)
  const node = (el) => ({ tag: el.tagName.toLowerCase(), id: el.id || '', cls: el.classList?.[0] || '' })
  // A full-page screenshot moves fixed elements away from where they measure. Cached: siblings share ancestors.
  const fixedCache = new Map()
  const insideFixed = (el) => {
    if (!el || el === document.documentElement) { return false }
    if (!fixedCache.has(el)) { fixedCache.set(el, getComputedStyle(el).position === 'fixed' || insideFixed(el.parentElement)) }
    return fixedCache.get(el)
  }
  const ancestorsOf = (el) => {
    const chain = []
    for (let up = el.parentElement; up && up !== document.body && chain.length < 3; up = up.parentElement) { chain.push(node(up)) }
    return chain
  }
  const sourceOf = (el) => el.currentSrc || ['src', 'data-src', 'srcset', 'poster'].map((a) => el.getAttribute(a)).find(Boolean)
    || (el.tagName === 'PICTURE' ? el.querySelector('img')?.currentSrc : '') || ''
  // A section capture is the viewport as seen: its own coordinates, fixed elements included.
  const [dx, dy] = viewportOnly ? [0, 0] : [window.scrollX, window.scrollY]
  const keep = (el, r) => (viewportOnly ? r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth : !insideFixed(el))
  const record = (el, rect) => ({
    x: rect.left + dx, y: rect.top + dy, width: rect.width, height: rect.height,
    tag: node(el).tag, role: el.getAttribute('role') || '',
    // A container's text is its whole subtree, which names nothing; innerText
    // keeps the breaks between menu entries or cells that textContent drops.
    text: containerTags.has(node(el).tag) ? '' : (el.innerText ?? el.textContent ?? '').slice(0, 200),
    alt: el.getAttribute('alt') || '', ariaLabel: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '',
    // The first visible heading inside a container is what a person would call it.
    heading: containerTags.has(node(el).tag) ? ([...el.querySelectorAll('h1, h2, h3, h4, h5, h6')].find((h) => h.checkVisibility())?.innerText ?? '').slice(0, 200) : '',
    src: sourceOf(el), self: node(el), ancestors: ancestorsOf(el)
  })

  // Bounding the scan, not just the result, keeps huge hidden menus cheap.
  const collect = (query, budget, minSide) => {
    const found = []
    for (const el of [...document.querySelectorAll(query)].slice(0, limit * 5)) {
      if (found.length >= budget) { break }
      const rect = el.getBoundingClientRect()
      if (rect.width <= minSide || rect.height <= minSide) { continue }
      // Also catches an ancestor with opacity 0, such as a stacked carousel slide.
      if (el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && keep(el, rect)) { found.push(record(el, rect)) }
    }
    return found
  }
  // Panels only get the budget the meaningful elements leave over.
  const elements = collect(selector, limit, 0)
  return [...elements, ...collect(fallbacks, limit - elements.length, minPanelSide)]
}

function asString(value) {
  return typeof value === 'string' ? value : ''
}

/** Single-line, control-character-free, capped page text. */
function cleanText(value) {
  // Bidi overrides and zero-width characters could make page text read as
  // something other than what it is, so they go along with control characters.
  // eslint-disable-next-line no-control-regex
  const text = asString(value).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ').trim()
  return text.length > MAX_NAME_LENGTH ? `${text.slice(0, MAX_NAME_LENGTH - 1)}…` : text
}

/** The file name a media source points at, without query string or hash. */
export function mediaName(src) {
  const source = asString(src).trim()
  if (source.startsWith('data:')) { return source.slice(0, source.search(/[;,]|$/)) }
  const firstCandidate = source.split(',')[0].trim().split(/\s+/)[0] ?? ''
  const path = firstCandidate.split(/[?#]/)[0]
  const segment = path.slice(path.lastIndexOf('/') + 1)
  try {
    return cleanText(decodeURIComponent(segment))
  } catch {
    return cleanText(segment)
  }
}

function elementName(raw, tag) {
  const label = [raw.ariaLabel, raw.alt, raw.title].map(cleanText).find(Boolean)
  if (label) { return label }
  return CONTAINERS.has(tag) || tag === 'div' ? '' : cleanText(raw.text)
}

function identifier(value) {
  const text = asString(value)
  return IDENTIFIER.test(text) ? text : ''
}

function selectorToken(node) {
  const id = identifier(node?.id)
  if (id) { return `#${id}` }
  const tag = identifier(node?.tag).toLowerCase()
  const cls = identifier(node?.cls)
  return cls ? `${tag}.${cls}` : tag
}

/** A short, readable selector: the element and up to three ancestors, cut at the nearest id (its own included). */
function buildSelector(raw) {
  const ancestors = Array.isArray(raw.ancestors) ? raw.ancestors.slice(0, MAX_ANCESTORS) : []
  const path = [raw.self, ...ancestors]
  const withId = path.findIndex((node) => identifier(node?.id))
  const chain = withId === -1 ? path : path.slice(0, withId + 1)
  return chain.toReversed().map(selectorToken).filter(Boolean).join(' ')
}

function validBox(raw) {
  const values = [raw.x, raw.y, raw.width, raw.height]
  return values.every((v) => typeof v === 'number' && Number.isFinite(v)) && raw.width > 0 && raw.height > 0
}

function normalizeElement(raw) {
  if (!raw || typeof raw !== 'object' || !validBox(raw)) { return null }
  const tag = identifier(raw.tag).toLowerCase()
  if (!tag) { return null }
  const name = elementName(raw, tag)
  const identified = Boolean(identifier(raw.self?.id) || identifier(raw.role) || (tag === 'div' && identifier(raw.self?.cls)))
  if (!name && !INTERACTIVE_OR_MEDIA.has(tag) && !CONTAINERS.has(tag) && !identified) { return null }
  return {
    tag,
    role: identifier(raw.role).toLowerCase(),
    name,
    media: mediaName(raw.src),
    selector: buildSelector(raw),
    heading: !name && (CONTAINERS.has(tag) || tag === 'div') ? cleanText(raw.heading) : '',
    box: { x: raw.x, y: raw.y, width: raw.width, height: raw.height }
  }
}

/** Validate and clean what the page returned; the page may have tampered with any of it. */
export function normalizeDomMap(raw) {
  if (!Array.isArray(raw)) { return [] }
  return raw.slice(0, MAX_ELEMENTS * 2).map(normalizeElement).filter(Boolean).slice(0, MAX_ELEMENTS)
}
