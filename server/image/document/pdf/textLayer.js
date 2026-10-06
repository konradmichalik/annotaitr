/**
 * Turn the text runs of a PDF page into the element map image mode matches
 * annotations against (server/image/common/elementMatch.js): one element per text
 * block, headings told apart by their font size, plus links. A PDF has no
 * DOM, so blocks are rebuilt from where the runs (one per word, see
 * renderWorker.js) sit on the page. The same blocks give the page's words in
 * reading order, which a text selection snaps to.
 */

const MAX_NAME_LENGTH = 80
// A heading's font is clearly larger than the page's body text.
const HEADING_RATIO = 1.2
const LEADING_BULLETS = /^[\s•●▪◦‣·*-]+/

const right = (box) => box.x + box.width
const bottom = (box) => box.y + box.height

function union(a, b) {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(right(a), right(b)) - x, height: Math.max(bottom(a), bottom(b)) - y }
}

function capName(text) {
  const name = text.replace(/\s+/g, ' ').replace(LEADING_BULLETS, '').trim()
  return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…` : name
}

// The worker reports each run's baseline; without it (tests) it is where a
// run's box puts it: descent below, ascent above.
const baselineOf = (run) => run.baseline ?? run.box.y + run.box.height * 0.8

/**
 * Runs whose baselines lie within a fraction of the font size of each other
 * share a row, whatever their size: a superscript, a larger word or a
 * fraction of a pixel of jitter never splits a line or reorders it.
 */
function groupRows(runs) {
  const rows = []
  for (const run of [...runs].sort((a, b) => baselineOf(a) - baselineOf(b))) {
    const row = rows.at(-1)
    if (row && baselineOf(run) - row.baseline <= Math.min(row.fontSize, run.fontSize) * 0.3) {
      row.runs.push(run)
    } else {
      rows.push({ baseline: baselineOf(run), fontSize: run.fontSize, runs: [run] })
    }
  }
  return rows
}

// The same word drawn again a fraction of its size away is fake bold.
const isDuplicate = (run, previous) => previous && run.str === previous.str
  && Math.abs(run.box.x - previous.box.x) < run.fontSize * 0.2

/** A row read left to right, split into lines where a column gap separates its runs. */
function rowLines(row) {
  const lines = []
  let previous = null
  for (const run of [...row.runs].sort((a, b) => a.box.x - b.box.x)) {
    if (isDuplicate(run, previous)) { continue }
    const line = lines.at(-1)
    if (line && run.box.x - right(line.box) <= run.fontSize * 1.5) {
      const gap = run.box.x - right(line.box)
      line.text += gap > run.fontSize * 0.15 ? ` ${run.str}` : run.str
      line.box = union(line.box, run.box)
      line.fontSize = Math.max(line.fontSize, run.fontSize)
      line.runs.push(run)
    } else {
      lines.push({ text: run.str, box: { ...run.box }, fontSize: run.fontSize, runs: [run] })
    }
    previous = run
  }
  return lines
}

function groupLines(runs) {
  return groupRows(runs.filter((r) => r.str.trim())).flatMap(rowLines)
}

const overlapsHorizontally = (a, b) => a.x < right(b) && right(a) > b.x
const similarSize = (a, b) => Math.abs(a - b) <= Math.max(a, b) * 0.15

/** Lines of one column, in one font size and without a paragraph gap, become one block. */
function groupBlocks(lines) {
  const blocks = []
  for (const line of [...lines].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
    const block = blocks.findLast((b) => {
      const gap = line.box.y - bottom(b.last.box)
      return overlapsHorizontally(b.last.box, line.box) && similarSize(b.fontSize, line.fontSize)
        && gap >= -line.fontSize * 0.3 && gap <= line.fontSize * 0.8
    })
    if (block) {
      block.text += ` ${line.text}`
      block.box = union(block.box, line.box)
      block.last = line
      block.lines.push(line)
    } else {
      blocks.push({ text: line.text, box: line.box, fontSize: line.fontSize, last: line, lines: [line] })
    }
  }
  return blocks
}

/** The font size most of the page's text is set in. */
function bodySize(blocks) {
  const chars = new Map()
  for (const { fontSize, text } of blocks) {
    const size = Math.round(fontSize)
    chars.set(size, (chars.get(size) ?? 0) + text.length)
  }
  return [...chars].reduce((best, entry) => (entry[1] > best[1] ? entry : best), [0, 0])[0]
}

// A block this much of the text's whole width separates the column bands
// above and below it, like a heading or a footer across two columns.
const SPANNING_RATIO = 0.6

/** Blocks side by side are columns: blocks whose horizontal ranges overlap join one. */
function columnsOf(blocks) {
  const columns = []
  for (const block of [...blocks].sort((a, b) => a.box.x - b.box.x)) {
    const column = columns.at(-1)
    if (column && block.box.x < column.right) {
      column.blocks.push(block)
      column.right = Math.max(column.right, right(block.box))
    } else {
      columns.push({ right: right(block.box), blocks: [block] })
    }
  }
  return columns.flatMap((column) => column.blocks.sort((a, b) => a.box.y - b.box.y))
}

/**
 * Blocks in reading order: top to bottom in bands between blocks that span
 * the text width, and within a band one column after the other.
 */
function readingOrder(blocks) {
  if (blocks.length === 0) { return [] }
  const left = Math.min(...blocks.map((b) => b.box.x))
  const width = Math.max(...blocks.map((b) => right(b.box))) - left
  const ordered = []
  let band = []
  for (const block of [...blocks].sort((a, b) => a.box.y - b.box.y)) {
    if (block.box.width >= width * SPANNING_RATIO) {
      ordered.push(...columnsOf(band), block)
      band = []
    } else {
      band.push(block)
    }
  }
  return [...ordered, ...columnsOf(band)]
}

/** Every word of the page in reading order: block by block, line by line. */
function wordsOf(blocks) {
  const lines = readingOrder(blocks).flatMap((block) => block.lines)
  return lines.flatMap((line, index) => line.runs.map((run) => ({ text: run.str.trim(), line: index, box: run.box })))
}

/**
 * @param {{ runs?: { str: string, fontSize: number, box: object }[], links?: { url: string, box: object }[] }} page
 *   text runs and links of one page, boxes in the rendered page's pixels
 * @returns {{ elements: object[], words: { text: string, line: number, box: object }[] }}
 */
export function buildTextLayer({ runs = [], links = [] }) {
  const blocks = groupBlocks(groupLines(runs))
  const body = bodySize(blocks)
  const text = blocks
    .map((block) => ({
      tag: block.fontSize >= body * HEADING_RATIO ? 'heading' : 'text',
      name: capName(block.text),
      selector: '',
      box: block.box
    }))
    .filter((element) => element.name)
  const linked = links.map(({ url, box }) => ({ tag: 'link', name: capName(url), selector: '', box }))
  return { elements: [...text, ...linked], words: wordsOf(blocks) }
}
