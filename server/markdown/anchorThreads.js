/**
 * Where last round's notes are in this round's files. A note is found again
 * by its quote, never by its block id: block ids are a parser's counter and
 * shift with every edit above them. The ladder: an unchanged file keeps the
 * place, a quote found in exactly one place moved there, anything else is an
 * orphan. No fuzzy matching, a confident wrong place is worse than none.
 */

import { countNewlines, diffLineRef } from './diffLines.js'
import { noteWhere } from './feedback.js'

const CONTEXT = 32
// Link targets and line-start markers render as nothing, so they are dropped from the source before comparing.
const LINK_TARGET = /\]\([^)\n]*\)/g
const LINE_MARKERS = /^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)+/gm
const INLINE_MARKUP = /[*_`~[\]|\\\s]/

function droppedRanges(raw) {
  const dropped = new Uint8Array(raw.length)
  for (const pattern of [LINK_TARGET, LINE_MARKERS]) {
    for (const match of raw.matchAll(pattern)) { dropped.fill(1, match.index, match.index + match[0].length) }
  }
  return dropped
}

/**
 * The text of the source without markup and whitespace, so a selection made
 * in the rendered page compares with it, and `map[i]` the source index of
 * each character left.
 */
export function project(raw) {
  const dropped = droppedRanges(raw)
  const chars = []
  const map = []
  for (let i = 0; i < raw.length; i++) {
    if (dropped[i] || INLINE_MARKUP.test(raw[i])) { continue }
    chars.push(raw[i])
    map.push(i)
  }
  return { text: chars.join(''), map }
}

function occurrences(text, wanted) {
  const found = []
  if (!wanted) { return found }
  for (let index = text.indexOf(wanted); index !== -1; index = text.indexOf(wanted, index + 1)) { found.push(index) }
  return found
}

// A pinpoint quotes its block cut at 200 characters plus an ellipsis the file never had.
function quoteOf(annotation) {
  if (annotation.type === 'INSERTION') { return annotation.afterContext || '' }
  const text = annotation.originalText || ''
  return annotation.targetType === 'pinpoint' && text.length > 200 && text.endsWith('...') ? text.slice(0, -3) : text
}

function hintLine(annotation, block) {
  const source = annotation.blockId?.match(/^source-line-(\d+)$/)
  if (source) { return Number(source[1]) + 1 }
  return (block?.startLine ?? 1) + countNewlines((block?.content || '').slice(0, annotation.startOffset ?? 0))
}

const lineOf = (content, index) => countNewlines(content.slice(0, index)) + 1

/** The note's quote with the text around it, from the occurrence closest to where the note was made. */
export function createAnchor(annotation, block, file) {
  const quote = quoteOf(annotation)
  if (annotation.targetType === 'global' || !quote) { return null }
  const projected = project(file.content)
  const wanted = project(quote).text
  const line = hintLine(annotation, block)
  const distance = (index) => Math.abs(lineOf(file.content, projected.map[index]) - line)
  const at = occurrences(projected.text, wanted).reduce((best, index) => (best === null || distance(index) < distance(best) ? index : best), null)
  const context = at === null
    ? { prefix: '', suffix: '' }
    : { prefix: projected.text.slice(Math.max(0, at - CONTEXT), at), suffix: projected.text.slice(at + wanted.length, at + wanted.length + CONTEXT) }
  return { quote, ...context, where: annotation.unanchored ? null : noteWhere(annotation, block), contentHash: file.contentHash }
}

/** The single place the quote is now, or why there is none. */
function uniqueMatch(projected, anchor) {
  const wanted = project(anchor.quote).text
  const found = occurrences(projected.text, wanted)
  if (found.length === 0) { return { error: 'The text is no longer in the document' } }
  if (found.length === 1) { return { at: found[0], length: wanted.length } }
  const fits = found.filter((at) => projected.text.slice(at - anchor.prefix.length, at) === anchor.prefix &&
    projected.text.slice(at + wanted.length, at + wanted.length + anchor.suffix.length) === anchor.suffix)
  return fits.length === 1 ? { at: fits[0], length: wanted.length } : { error: 'The text now appears in several places' }
}

const FENCE = /^(`{3,}|~{3,})\s*(.*)$/

/** The fenced block a line sits in, with its info string and first content line, or null. */
function fenceAround(lines, lineIndex) {
  let open = null
  for (let i = 0; i < lineIndex; i++) {
    const fence = FENCE.exec(lines[i])
    if (!fence) { continue }
    if (!open) {
      open = { marker: fence[1], info: fence[2], start: i + 1 }
    } else if (lines[i].trim().startsWith(open.marker) && fence[2] === '') {
      open = null
    }
  }
  return open
}

const lineRef = (first, last) => (first === last ? `Line ${first}` : `Lines ${first}-${last}`)

/** Where a stretch of the source is: its lines, or the changed file and lines when it sits in a `diff <path>` block. */
export function whereAt(content, start, end) {
  const first = lineOf(content, start)
  const last = lineOf(content, end)
  const lines = content.split('\n')
  const fence = fenceAround(lines, first - 1)
  if (fence) {
    const body = lines.slice(fence.start, last).join('\n')
    const inDiff = diffLineRef({ type: 'code', language: fence.info, content: body }, first - 1 - fence.start, last - 1 - fence.start)
    if (inDiff) { return inDiff }
  }
  return lineRef(first, last)
}

const orphan = (reason) => ({ anchor: 'orphan', reason, place: null })

/** Where one thread is in this round: `{ anchor, reason, place }`, `place` naming the file, the lines and the quote. */
export function locateThread(thread, file) {
  if (thread.annotation.targetType === 'global' || !thread.anchor) { return { anchor: 'exact', reason: null, place: null } }
  if (!file) { return orphan('The file is no longer part of this review') }
  const projected = project(file.content)
  const found = uniqueMatch(projected, thread.anchor)
  const unchanged = file.contentHash === thread.anchor.contentHash
  if (found.error && !unchanged) { return orphan(found.error) }
  const start = found.error ? null : projected.map[found.at]
  const end = found.error ? null : projected.map[found.at + found.length - 1]
  const place = {
    path: file.path,
    where: unchanged ? thread.anchor.where : whereAt(file.content, start, end),
    line: start === null ? null : lineOf(file.content, start),
    quote: thread.anchor.quote
  }
  return { anchor: unchanged ? 'exact' : 'moved', reason: null, place }
}

/**
 * Last round's threads, each with where it is in `files` (`{ absolutePath, path, content, contentHash }`).
 * `anchor` becomes the outcome as in image mode; `quote` keeps the original text, which an orphan still shows.
 */
export function anchorThreads(previous, files) {
  if (!previous) { return [] }
  const byPath = new Map(files.map((f) => [f.absolutePath, f]))
  return previous.threads.map((thread) => ({ ...thread, ...locateThread(thread, byPath.get(thread.file)), quote: thread.anchor?.quote ?? null }))
}
