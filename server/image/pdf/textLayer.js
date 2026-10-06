/**
 * Turn the text runs of a PDF page into the element map image mode matches
 * annotations against (server/image/elementMatch.js): one element per text
 * block, headings told apart by their font size, plus links. A PDF has no
 * DOM, so blocks are rebuilt from where the runs sit on the page.
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

/** Runs on one baseline and close to each other, read left to right, become one line. */
function groupLines(runs) {
  const sorted = runs
    .filter((r) => r.str.trim())
    .sort((a, b) => bottom(a.box) - bottom(b.box) || a.box.x - b.box.x)
  const lines = []
  for (const run of sorted) {
    const line = lines.findLast((l) => Math.abs(bottom(l.box) - bottom(run.box)) <= run.fontSize * 0.5
      && run.box.x - right(l.box) <= run.fontSize * 1.5
      && run.box.x >= l.box.x)
    if (line) {
      const gap = run.box.x - right(line.box)
      line.text += gap > run.fontSize * 0.15 ? ` ${run.str}` : run.str
      line.box = union(line.box, run.box)
      line.fontSize = Math.max(line.fontSize, run.fontSize)
    } else {
      lines.push({ text: run.str, box: { ...run.box }, fontSize: run.fontSize })
    }
  }
  return lines
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
    } else {
      blocks.push({ text: line.text, box: line.box, fontSize: line.fontSize, last: line })
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

/**
 * @param {{ runs?: { str: string, fontSize: number, box: object }[], links?: { url: string, box: object }[] }} page
 *   text runs and links of one page, boxes in the rendered page's pixels
 */
export function buildTextElements({ runs = [], links = [] }) {
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
  return [...text, ...linked]
}
