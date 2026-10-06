/**
 * Selecting text on a PDF page: the page's words come in reading order
 * (server/image/pdf/textLayer.js), so a drag from one word to another
 * selects every word in between, like text selection in a browser.
 */

// How far from a word a press may land and still start a selection on it.
const REACH = 1.5

function distanceTo(box, p) {
  const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.width))
  const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.height))
  return Math.hypot(dx, dy)
}

/** The index of the word under or nearest to `point`, or -1 when no word is close. */
export function wordIndexAt(words, point) {
  let best = -1
  let bestDistance = Infinity
  words.forEach((word, index) => {
    const d = distanceTo(word.box, point)
    if (d < bestDistance && d <= word.box.height * REACH) {
      best = index
      bestDistance = d
    }
  })
  return best
}

function union(a, b) {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
}

/**
 * The selection between two word indexes (in either order): one rectangle
 * per line, the box around them and the selected words as one string.
 * Null when either end is not on a word.
 */
export function selectWords(words, from, to) {
  if (from < 0 || to < 0) { return null }
  const selected = words.slice(Math.min(from, to), Math.max(from, to) + 1)
  const lines = new Map()
  for (const word of selected) {
    lines.set(word.line, lines.has(word.line) ? union(lines.get(word.line), word.box) : { ...word.box })
  }
  const rects = [...lines.values()]
  return {
    geometry: { ...rects.reduce(union), rects },
    quote: selected.map((word) => word.text).join(' ')
  }
}
