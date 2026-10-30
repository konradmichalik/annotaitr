import { parseDiffLines } from './diffLines.js'

const MAX_PREVIEW_LINES = 12

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The finder for `path:line` and `path:from-to` of the changed `paths`, built
 * once because it runs on every piece of text. Numbers are lines of the new
 * file, the longest path wins where two start alike.
 */
export function createFileLineRefFinder(paths) {
  if (paths.size === 0) { return () => null }
  const alternatives = [...paths].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')
  const pattern = new RegExp(`(?<![\\w./-])(${alternatives}):(\\d+)(?:-(\\d+))?(?![\\w-])`, 'g')
  return (text) => {
    for (const match of text.matchAll(pattern)) {
      const start = Number(match[2])
      const end = match[3] === undefined ? start : Number(match[3])
      if (start >= 1 && end >= start) {
        return { index: match.index, length: match[0].length, path: match[1], start, end }
      }
    }
    return null
  }
}

/**
 * The lines of a file's diff around lines `start` to `end` of the new file,
 * `more` counting those past the preview's limit. `covered` is false when no
 * line of the range is part of the diff.
 */
export function previewLines(diff, start, end, context = 3) {
  // Removed lines have no number in the new file. A real blank line is ' ', so '' is only an artefact of splitting.
  const numbered = parseDiffLines(diff).filter((line) => (line.kind === 'add' || line.kind === 'context') && line.newNo !== null && line.text !== '')
  if (!numbered.some((line) => line.newNo >= start && line.newNo <= end)) { return { covered: false, lines: [], more: 0 } }
  const around = numbered.filter((line) => line.newNo >= start - context && line.newNo <= end + context)
  return {
    covered: true,
    lines: around.slice(0, MAX_PREVIEW_LINES).map((line) => ({ no: line.newNo, text: line.text.slice(1) })),
    more: Math.max(0, around.length - MAX_PREVIEW_LINES)
  }
}
