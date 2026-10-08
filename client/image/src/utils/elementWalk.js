/**
 * Keyboard access to the Element tool. The DOM map lists elements in
 * document order with their boxes, but without links between them, so the
 * parent is derived from the boxes: the smallest other element that holds
 * this one.
 */

/** The element after (`direction` 1) or before (-1) `current` in document order, the first one without `current`, or null past either end. */
export function stepElement(map, current, direction) {
  if (map.length === 0) { return null }
  if (!current) { return direction > 0 ? map[0] : map.at(-1) }
  return map[map.indexOf(current) + direction] ?? null
}

const holds = (outer, inner) => outer.x <= inner.x && outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height
const sameBox = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
const area = ({ width, height }) => width * height

/** The smallest element whose box holds `element`'s and is larger, or null for the outermost one. */
export function parentOf(map, element) {
  return map
    .filter((other) => other !== element && holds(other.box, element.box) && !sameBox(other.box, element.box))
    .reduce((best, other) => (best && area(best.box) <= area(other.box) ? best : other), null)
}

/** The label over an outlined element: its selector and size in page pixels. */
export function elementCaption({ selector, box }) {
  return `${selector} ${Math.round(box.width)}×${Math.round(box.height)}`
}
