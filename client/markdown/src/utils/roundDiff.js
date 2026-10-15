/**
 * What changed in a document since the reviewer's last round, block by block.
 * Top-level nodes are compared, so a quote or an HTML wrapper counts as one
 * unit with everything inside it. A removed node is read as changed only when
 * an added node near it has the same type and shares enough words; a moved
 * node stays removed and added, since guessing a move would claim more than
 * the text shows.
 */

import { groupHtmlWrappers } from './htmlWrappers.js'
import { parseMarkdownToBlocks } from './parser.js'
import { editScript } from './editScript.js'

// Where a block sits says nothing about what it says, and shifts with every edit above it.
const POSITION = new Set(['id', 'order', 'startLine', 'parentId'])
// Half the words in common (Dice) still reads as a revision of the same block; less is a rewrite.
const PAIR_SIMILARITY = 0.5
// How far ahead a removed node is looked for, so pairing stays linear in long runs.
const PAIR_LOOKAHEAD = 8
const WORD = /[\p{L}\p{N}]+/gu

function signature(node) {
  const fields = Object.entries(node.block).filter(([key]) => !POSITION.has(key))
  return JSON.stringify([fields, (node.children ?? []).map(signature)])
}

/** The earlier round's blocks with ids of their own, so they never collide with this round's. */
function asEarlier(blocks) {
  const rename = (id) => (id ? `earlier-${id}` : id)
  return blocks.map((block) => ({ ...block, id: rename(block.id), ...(block.parentId ? { parentId: rename(block.parentId) } : {}) }))
}

/** Each node as a small integer, equal for equal signatures, so the edit script compares numbers. */
function numbered(earlier, current) {
  const ids = new Map()
  const idOf = (node) => {
    const key = signature(node)
    if (!ids.has(key)) { ids.set(key, ids.size) }
    return ids.get(key)
  }
  return [earlier.map(idOf), current.map(idOf)]
}

const words = new WeakMap()
function wordsOf(node) {
  if (!words.has(node)) {
    const texts = [node.block.content ?? '', ...(node.children ?? []).map((child) => [...wordsOf(child)].join(' '))]
    words.set(node, new Set(texts.join(' ').toLowerCase().match(WORD) ?? []))
  }
  return words.get(node)
}

function isRevisionOf(earlier, node) {
  if (earlier.block.type !== node.block.type) { return false }
  const [a, b] = [wordsOf(earlier), wordsOf(node)]
  if (a.size + b.size === 0) { return true }
  const shared = [...a].filter((word) => b.has(word)).length
  return (2 * shared) / (a.size + b.size) >= PAIR_SIMILARITY
}

const removedEntry = (node) => ({ change: 'removed', node })
const addedEntry = (node) => ({ change: 'added', node })

/** One run of removed and added nodes between two unchanged ones: revisions paired in order, removed before added. */
function pairRun(removed, added) {
  const entries = []
  let next = 0
  let waiting = []
  for (const node of added) {
    const found = removed.slice(next, next + PAIR_LOOKAHEAD).findIndex((earlier) => isRevisionOf(earlier, node))
    if (found === -1) {
      waiting = [...waiting, node]
      continue
    }
    entries.push(...removed.slice(next, next + found).map(removedEntry), ...waiting.map(addedEntry), { change: 'changed', node, before: removed[next + found] })
    next += found + 1
    waiting = []
  }
  return [...entries, ...removed.slice(next).map(removedEntry), ...waiting.map(addedEntry)]
}

/**
 * The current document as `{ change, node, before? }` entries in reading
 * order: `same`, `added` and `changed` carry a current node (a changed one its
 * earlier version as `before`), `removed` an earlier node.
 */
export function diffRounds(previousBlocks, currentBlocks) {
  const earlier = groupHtmlWrappers(asEarlier(previousBlocks))
  const current = groupHtmlWrappers(currentBlocks)
  const entries = []
  let removed = []
  let added = []
  for (const step of editScript(...numbered(earlier, current))) {
    if (step.op === 'removed') { removed.push(earlier[step.i]) }
    if (step.op === 'added') { added.push(current[step.j]) }
    if (step.op === 'same') {
      entries.push(...pairRun(removed, added), { change: 'same', node: current[step.j] })
      removed = []
      added = []
    }
  }
  return [...entries, ...pairRun(removed, added)]
}

/** How many nodes were added, changed and removed. */
export function roundDiffCounts(entries) {
  const count = (change) => entries.filter((e) => e.change === change).length
  return { added: count('added'), changed: count('changed'), removed: count('removed') }
}

/**
 * A reviewed file against its last round: `{ round, entries, counts }`, or
 * null when there is nothing to show. Plain text has no blocks worth
 * comparing and a changes walkthrough already is a diff.
 */
export function roundDiffOf(file) {
  const previous = file?.previousRound
  if (!previous || file.isPlainText || file.kind === 'changes') { return null }
  const entries = diffRounds(parseMarkdownToBlocks(previous.content), file.blocks)
  const counts = roundDiffCounts(entries)
  return counts.added + counts.changed + counts.removed === 0 ? null : { round: previous.round, entries, counts }
}

/** The view on screen: the changes view falls back to the preview in a file without a last round. */
export function shownView(viewMode, { plainText, roundDiff }) {
  if (plainText) { return 'source' }
  return viewMode === 'changes' && !roundDiff ? 'preview' : viewMode
}
