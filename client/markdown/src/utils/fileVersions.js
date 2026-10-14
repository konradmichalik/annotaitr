import { parseDiffLines } from './diffLines.js'
import { parseMarkdownToBlocks } from './parser.js'

/**
 * The Read view of a markdown file in a changes walkthrough: the file as it is
 * now, rebuilt from its diff with the whole file as context, rendered like
 * markdown mode renders it.
 */

// The extensions markdown mode renders (server/markdown/file.js).
const MARKDOWN_PATH = /\.(md|markdown|mdown|mkd)$/i

const READ_PREFIX = 'read:'
const READ_ID = /^read:(.*):(block-\d+)$/

export const VIEWS = ['diff', 'read']

export function isMarkdownPath(path) {
  return MARKDOWN_PATH.test(path ?? '')
}

/** A file whose card offers Read: markdown that still exists and has a diff to rebuild it from. */
export function canRead(file) {
  return Boolean(file?.hasDiff) && file.status !== 'D' && isMarkdownPath(file.path)
}

/** The view a card shows: the one picked for the file, else the stored default. */
export function fileView(views, file, defaultView) {
  if (!canRead(file)) { return 'diff' }
  const view = views.get(file.path) ?? defaultView
  return VIEWS.includes(view) ? view : 'diff'
}

/**
 * The new file from a diff that holds all of it as context: unchanged and
 * added lines without their sign. Headers, hunk lines and git's no-newline
 * marker carry no new-file line number and are left out.
 */
export function newFileText(diff) {
  return parseDiffLines(diff ?? '')
    // A real diff line starts with its sign; an empty string is only the trailing newline.
    .filter((line) => line.kind !== 'del' && line.newNo !== null && line.text !== '')
    .map((line) => line.text.slice(1))
    .join('\n')
}

const readId = (path, id) => `${READ_PREFIX}${path}:${id}`

/**
 * The Read view's blocks: ids that cannot clash with the walkthrough's and
 * name the file, the path for the line reference and `sortLine`, where the
 * file's card sits in the walkthrough, for the order of the notes.
 */
export function readBlocks(path, diff, sortLine) {
  return parseMarkdownToBlocks(newFileText(diff)).map((block) => ({
    ...block,
    id: readId(path, block.id),
    ...(block.parentId ? { parentId: readId(path, block.parentId) } : {}),
    path,
    sortLine
  }))
}

// Read views render below the card's own blocks, so their notes sort after the card's last line.
const lastLineOf = (file) => Math.max(file.heading.startLine, file.focusBlock?.startLine ?? 0, ...file.blocks.map((b) => b.startLine))

/** The Read view blocks of every markdown file whose whole diff has loaded, by path. */
export function readViewsOf(files, entries) {
  return new Map(files.filter(canRead).flatMap((file) => {
    const diff = entries.get(file.path)?.diff
    return typeof diff === 'string' ? [[file.path, readBlocks(file.path, diff, lastLineOf(file))]] : []
  }))
}

/** The file a Read view block belongs to, or null for any other block id. */
export function readPathOf(blockId) {
  return blockId?.match(READ_ID)?.[1] ?? null
}
