/**
 * The shortest edit from one list of numbers to another, by longest common
 * subsequence. The common start and end are set aside first, so one edit in a
 * long document costs only its own neighbourhood.
 */

// About 4 MB of table; a larger differing middle comes back as one rewrite instead of freezing the page.
export const MAX_CELLS = 1_000_000

/** How many entries match at the start and, after those, at the end. */
function commonEnds(a, b) {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) { start++ }
  let end = 0
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) { end++ }
  return { start, end }
}

/** `table[i][j]`: the longest common run of `a` from `i` and `b` from `j`. */
function suffixTable(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table
}

/** The script of the differing middle, its indices shifted by `at` into the whole lists. */
function middleScript(a, b, at) {
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((_, k) => ({ op: 'removed', i: at + k })), ...b.map((_, k) => ({ op: 'added', j: at + k }))]
  }
  const table = suffixTable(a, b)
  const steps = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      steps.push({ op: 'same', i: at + i, j: at + j })
      i++
      j++
    } else if (j >= b.length || (i < a.length && table[i + 1][j] >= table[i][j + 1])) {
      steps.push({ op: 'removed', i: at + i })
      i++
    } else {
      steps.push({ op: 'added', j: at + j })
      j++
    }
  }
  return steps
}

/** Steps in order: `same` with both indices, `removed` with the index in `before`, `added` with the one in `after`. A removal comes before an addition. */
export function editScript(before, after) {
  const { start, end } = commonEnds(before, after)
  const same = (count, i, j) => Array.from({ length: count }, (_, k) => ({ op: 'same', i: i + k, j: j + k }))
  const middle = middleScript(before.slice(start, before.length - end), after.slice(start, after.length - end), start)
  return [...same(start, 0, 0), ...middle, ...same(end, before.length - end, after.length - end)]
}
