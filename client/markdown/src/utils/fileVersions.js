import { parseDiffLines } from './diffLines.js'
import { parseMarkdownToBlocks } from './parser.js'
import { diffBlocks } from './roundDiff.js'

/**
 * The Read and Changes views of a markdown file in a changes walkthrough. Read
 * is the file as it is now, rebuilt from its diff with the whole file as
 * context and rendered like markdown mode renders it. Changes compares it
 * block by block with the file as it was, rebuilt from the same diff.
 */

// The extensions markdown mode renders (server/markdown/file.js).
const MARKDOWN_PATH = /\.(md|markdown|mdown|mkd)$/i

const READ_PREFIX = 'read:'
const OLD_PREFIX = 'old:'
const VIEW_ID = /^(?:read|old):(.*):(block-\d+)$/

export const VIEWS = ['diff', 'read', 'changes']

// Unchanged blocks shown next to a change, and the fewest a fold hides: a button for less costs more than it saves.
const FOLD_CONTEXT = 1
const MIN_FOLD = 3

export function isMarkdownPath(path) {
  return MARKDOWN_PATH.test(path ?? '')
}

/** A file whose card offers Read and Changes: markdown that still exists and has a diff to rebuild it from. */
export function canRead(file) {
  return Boolean(file?.hasDiff) && file.status !== 'D' && isMarkdownPath(file.path)
}

/** The view a card shows: the one picked for the file, else the stored default. */
export function fileView(views, file, defaultView) {
  if (!canRead(file)) { return 'diff' }
  const view = views.get(file.path) ?? defaultView
  return VIEWS.includes(view) ? view : 'diff'
}

/** The view after `view` for P: Diff, Read, Changes and round again. */
export function nextView(view) {
  return VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]
}

/**
 * One side of a file from a diff that holds all of it as context: unchanged
 * lines and the side's own lines, without their sign. Headers, hunk lines and
 * git's no-newline marker carry no line number and are left out.
 */
function sideText(diff, skipped, lineNo) {
  return parseDiffLines(diff ?? '')
    // A real diff line starts with its sign; an empty string is only the trailing newline.
    .filter((line) => line.kind !== skipped && line[lineNo] !== null && line.text !== '')
    .map((line) => line.text.slice(1))
    .join('\n')
}

/** The new file: context and added lines. */
export const newFileText = (diff) => sideText(diff, 'del', 'newNo')

/** The old file: context and removed lines; empty for an added file. */
export const oldFileText = (diff) => sideText(diff, 'add', 'oldNo')

const prefixed = (prefix, path, id) => `${prefix}${path}:${id}`

/**
 * One side's blocks: ids that cannot clash with the walkthrough's and name
 * the file, the path for the line reference and `sortLine`, where the file's
 * card sits in the walkthrough, for the order of the notes.
 */
function sideBlocks(prefix, text, path, sortLine, extra) {
  return parseMarkdownToBlocks(text).map((block) => ({
    ...block,
    id: prefixed(prefix, path, block.id),
    ...(block.parentId ? { parentId: prefixed(prefix, path, block.parentId) } : {}),
    path,
    sortLine,
    ...extra
  }))
}

/** The Read view's blocks, the file as it is now. */
export const readBlocks = (path, diff, sortLine) => sideBlocks(READ_PREFIX, newFileText(diff), path, sortLine, {})

/** The blocks of the file as it was, shown removed or changed in the Changes view; their lines are old ones. */
export const oldBlocks = (path, diff, sortLine) => sideBlocks(OLD_PREFIX, oldFileText(diff), path, sortLine, { side: 'old' })

// Read views render below the card's own blocks, so their notes sort after the card's last line.
const lastLineOf = (file) => Math.max(file.heading.startLine, file.focusBlock?.startLine ?? 0, ...file.blocks.map((b) => b.startLine))

const nodeIds = (node) => [node.block.id, ...(node.children ?? []).flatMap(nodeIds)]

/**
 * Each block's place in the Changes view: two per entry, the old version just
 * before the new one, since lines of the old and the new file do not compare.
 */
function entryIndexes(entries) {
  return new Map(entries.flatMap((entry, i) => [
    ...(entry.before ? nodeIds(entry.before).map((id) => [id, 2 * i]) : []),
    ...(entry.change === 'removed' ? nodeIds(entry.node).map((id) => [id, 2 * i]) : nodeIds(entry.node).map((id) => [id, 2 * i + 1]))
  ]))
}

function viewOf(path, diff, sortLine) {
  const read = readBlocks(path, diff, sortLine)
  const old = oldBlocks(path, diff, sortLine)
  const entries = diffBlocks(old, read)
  const index = entryIndexes(entries)
  const placed = (block) => ({ ...block, entryIndex: index.get(block.id) ?? 0 })
  return { diff, sortLine, blocks: read.map(placed), oldBlocks: old.map(placed), entries }
}

/**
 * The Read and Changes views of every markdown file whose whole diff has
 * loaded, by path, as `{ diff, sortLine, blocks, oldBlocks, entries }`. A view
 * in `previous` with the same diff and place is kept as it is, so one file
 * loading does not parse all the others again.
 */
export function readViewsOf(files, entries, previous = new Map()) {
  return new Map(files.filter(canRead).flatMap((file) => {
    const diff = entries.get(file.path)?.diff
    if (typeof diff !== 'string') { return [] }
    const sortLine = lastLineOf(file)
    const known = previous.get(file.path)
    return [[file.path, known?.diff === diff && known.sortLine === sortLine ? known : viewOf(file.path, diff, sortLine)]]
  }))
}

/** The file a Read or Changes view block belongs to, or null for any other block id. */
export function readPathOf(blockId) {
  return blockId?.match(VIEW_ID)?.[1] ?? null
}

/** Whether a block belongs to the file as it was, which only the Changes view shows. */
export function isOldBlock(blockId) {
  return Boolean(blockId?.startsWith(OLD_PREFIX) && readPathOf(blockId))
}

/**
 * The unchanged runs the Changes view folds, as `{ from, to, key }` entry
 * indices (`to` exclusive), leaving the blocks next to a change open. A run
 * holding a note in `noted` stays open whole, so a note added in an opened
 * run never folds its neighbours away.
 */
export function foldRuns(entries, noted) {
  const changedNear = (i) => entries.slice(Math.max(0, i - FOLD_CONTEXT), i + FOLD_CONTEXT + 1).some((e) => e.change !== 'same')
  const hasNote = (entry) => nodeIds(entry.node).some((id) => noted.has(id))
  const folds = []
  let from = null
  let open = false
  const close = (to) => {
    if (from !== null && !open && to - from >= MIN_FOLD) { folds.push({ from, to, key: entries[from].node.block.id }) }
    from = null
    open = false
  }
  entries.forEach((entry, i) => {
    if (entry.change !== 'same' || changedNear(i)) { close(i); return }
    if (from === null) { from = i }
    open = open || hasNote(entry)
  })
  close(entries.length)
  return folds
}
