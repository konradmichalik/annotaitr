/**
 * What changed in a document since the reviewer's last round, block by block.
 * Top-level nodes are compared, so a quote or an HTML wrapper counts as one
 * unit with everything inside it. A removed node right before an added one is
 * read as that node changed; a moved node stays removed and added, since
 * guessing a move would claim more than the text shows.
 */

import { groupHtmlWrappers } from './htmlWrappers.js'

// Where a block sits says nothing about what it says, and shifts with every edit above it.
const POSITION = new Set(['id', 'order', 'startLine', 'parentId'])

function signature(node) {
  const fields = Object.entries(node.block).filter(([key]) => !POSITION.has(key))
  return JSON.stringify([fields, (node.children ?? []).map(signature)])
}

/** The earlier round's blocks with ids of their own, so they never collide with this round's. */
function asEarlier(blocks) {
  const rename = (id) => (id ? `earlier-${id}` : id)
  return blocks.map((block) => ({ ...block, id: rename(block.id), ...(block.parentId ? { parentId: rename(block.parentId) } : {}) }))
}

/** `table[i][j]`: the longest common run of `a` from `i` and `b` from `j`. */
function suffixTable(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table
}

/** The edit script: `same` with the current index, `removed` with the earlier one, `added` with the current one. */
function editScript(before, after) {
  const table = suffixTable(before, after)
  const steps = []
  let i = 0
  let j = 0
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      steps.push({ op: 'same', i, j })
      i++
      j++
    } else if (j >= after.length || (i < before.length && table[i + 1][j] >= table[i][j + 1])) {
      steps.push({ op: 'removed', i })
      i++
    } else {
      steps.push({ op: 'added', j })
      j++
    }
  }
  return steps
}

/** One run of removed and added nodes between two unchanged ones, paired in order. */
function pairRun(removed, added) {
  const paired = Math.min(removed.length, added.length)
  return [
    ...added.slice(0, paired).map((node, k) => ({ change: 'changed', node, before: removed[k] })),
    ...removed.slice(paired).map((node) => ({ change: 'removed', node })),
    ...added.slice(paired).map((node) => ({ change: 'added', node }))
  ]
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
  let run = { removed: [], added: [] }
  const flush = () => {
    entries.push(...pairRun(run.removed, run.added))
    run = { removed: [], added: [] }
  }
  for (const step of editScript(earlier.map(signature), current.map(signature))) {
    if (step.op === 'removed') { run = { ...run, removed: [...run.removed, earlier[step.i]] } }
    if (step.op === 'added') { run = { ...run, added: [...run.added, current[step.j]] } }
    if (step.op === 'same') {
      flush()
      entries.push({ change: 'same', node: current[step.j] })
    }
  }
  flush()
  return entries
}

/** How many nodes were added, changed and removed. */
export function roundDiffCounts(entries) {
  const count = (change) => entries.filter((e) => e.change === change).length
  return { added: count('added'), changed: count('changed'), removed: count('removed') }
}
