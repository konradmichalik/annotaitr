import { describe, it, expect } from 'vitest'
import { annotationBounds, padRect, clampRect, clusterNotes, planCrops, cropFileName } from '../../../../server/image/common/crops.js'

// Default stroke widths in server units: 4 for shapes, 18 for the highlighter; arrow head 16.
const box = (x, y, width, height, extra = {}) => ({ type: 'box', geometry: { x, y, width, height }, ...extra })
const pin = (x, y) => ({ type: 'pin', geometry: { x, y } })

describe('annotationBounds', () => {
  it('grows a box by half its stroke plus the badge radius', () => {
    expect(annotationBounds(box(100, 200, 50, 40))).toEqual({ x: 87, y: 187, width: 76, height: 66 })
  })

  it('treats an element and a text selection like a box', () => {
    expect(annotationBounds({ type: 'element', geometry: { x: 100, y: 200, width: 50, height: 40 } }))
      .toEqual({ x: 87, y: 187, width: 76, height: 66 })
    const text = { type: 'text', geometry: { x: 100, y: 200, width: 50, height: 40, rects: [] } }
    expect(annotationBounds(text)).toEqual({ x: 87, y: 187, width: 76, height: 66 })
  })

  it('grows an arrow by its head length on top of stroke and badge', () => {
    const arrow = { type: 'arrow', geometry: { x1: 300, y1: 100, x2: 100, y2: 200 } }
    // head 16, half stroke 2, badge 11
    expect(annotationBounds(arrow)).toEqual({ x: 71, y: 71, width: 258, height: 158 })
  })

  it('takes the box around the points of a freehand mark and a highlighter', () => {
    const freehand = { type: 'freehand', geometry: { points: [{ x: 10, y: 50 }, { x: 40, y: 20 }, { x: 30, y: 90 }] } }
    expect(annotationBounds(freehand)).toEqual({ x: -3, y: 7, width: 56, height: 96 })
    const highlighter = { type: 'highlighter', geometry: { points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] } }
    expect(annotationBounds(highlighter)).toEqual({ x: 80, y: 80, width: 140, height: 40 })
  })

  it('grows a pin by half stroke plus the pin radius', () => {
    expect(annotationBounds(pin(500, 400))).toEqual({ x: 484, y: 384, width: 32, height: 32 })
  })
})

describe('padRect and clampRect', () => {
  it('pads by at least 64 px and by half the longer side of a large mark', () => {
    expect(padRect({ x: 100, y: 100, width: 20, height: 10 })).toEqual({ x: 36, y: 36, width: 148, height: 138 })
    expect(padRect({ x: 1000, y: 1000, width: 400, height: 100 })).toEqual({ x: 800, y: 800, width: 800, height: 500 })
  })

  it('grows a small rect to the 400x300 minimum around its centre', () => {
    expect(clampRect({ x: 900, y: 900, width: 100, height: 100 }, 4000, 3000))
      .toEqual({ x: 750, y: 800, width: 400, height: 300 })
  })

  it('shifts a rect at the edge back inside instead of shrinking it', () => {
    expect(clampRect({ x: -50, y: 2900, width: 500, height: 400 }, 4000, 3000))
      .toEqual({ x: 0, y: 2600, width: 500, height: 400 })
    expect(clampRect({ x: 3800, y: -20, width: 400, height: 300 }, 4000, 3000))
      .toEqual({ x: 3600, y: 0, width: 400, height: 300 })
  })

  it('keeps a rect with a fractional size inside the image at the bottom and right edges', () => {
    expect(clampRect({ x: 1300, y: 300, width: 400.5, height: 300.5 }, 1600, 600))
      .toEqual({ x: 1199, y: 299, width: 401, height: 301 })
  })

  it('never grows past the image', () => {
    expect(clampRect({ x: 10, y: 10, width: 100, height: 100 }, 300, 200))
      .toEqual({ x: 0, y: 0, width: 300, height: 200 })
  })
})

describe('clusterNotes', () => {
  it('joins notes whose padded areas overlap, also transitively', () => {
    const notes = [box(100, 100, 20, 20), box(250, 100, 20, 20), box(400, 100, 20, 20), box(3000, 2000, 20, 20)]
    expect(clusterNotes(notes)).toEqual([[0, 1, 2], [3]])
  })
})

describe('planCrops', () => {
  it('plans one crop per distant note, in number order', () => {
    const plan = planCrops([box(3000, 2000, 50, 40), box(100, 200, 50, 40)], [2, 1], 4000, 3000)
    expect(plan).toEqual([
      { numbers: [1], rect: { x: 0, y: 70, width: 400, height: 300 } },
      { numbers: [2], rect: { x: 2825, y: 1870, width: 400, height: 300 } }
    ])
  })

  it('gives notes close together one shared crop', () => {
    const plan = planCrops([box(100, 100, 50, 50), pin(200, 120)], [1, 2], 4000, 3000)
    expect(plan).toHaveLength(1)
    expect(plan[0].numbers).toEqual([1, 2])
  })

  it('leaves out general, page and span comments', () => {
    const notes = [
      { type: 'comment', text: 'general' },
      { type: 'comment', page: 2, text: 'page' },
      { type: 'comment', time: 1, endTime: 3, text: 'span' },
      box(100, 200, 50, 40)
    ]
    expect(planCrops(notes, [undefined, 1, 2, 3], 4000, 3000).map((c) => c.numbers)).toEqual([[3]])
  })

  it('skips a crop covering more than half the image', () => {
    expect(planCrops([box(100, 100, 50, 40)], [1], 500, 400)).toEqual([])
    expect(planCrops([box(100, 100, 2000, 1500)], [1], 4000, 3000)).toEqual([])
  })

  it('caps the crops at 20 per image', () => {
    const notes = Array.from({ length: 25 }, (_, i) => box((i % 5) * 800 + 100, Math.floor(i / 5) * 600 + 100, 20, 20))
    const plan = planCrops(notes, notes.map((_, i) => i + 1), 4000, 3000)
    expect(plan).toHaveLength(20)
    expect(plan.at(-1).numbers).toEqual([20])
  })
})

describe('cropFileName', () => {
  it('names a crop after its zero-padded numbers', () => {
    expect(cropFileName('', [3])).toBe('crop-03.png')
    expect(cropFileName('', [3, 5])).toBe('crop-03-05.png')
    expect(cropFileName('page-07-', [4])).toBe('page-07-crop-04.png')
    expect(cropFileName('', [3, 5, 8])).toBe('crop-03-05-08.png')
    expect(cropFileName('', [3, 5, 8, 9])).toBe('crop-03-05-etc.png')
    expect(cropFileName('', [123])).toBe('crop-123.png')
  })
})
