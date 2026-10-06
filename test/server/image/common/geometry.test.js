import { describe, it, expect } from 'vitest'
import { describePosition, findNearbyAnnotationNumbers } from '../../../../server/image/common/geometry.js'

describe('describePosition', () => {
  it('describes a pin near the top-left', () => {
    const pin = { type: 'pin', geometry: { x: 10, y: 10 } }
    expect(describePosition(pin, 100, 100)).toBe('top left (~10% from top, ~10% from left)')
  })

  it('describes a selected element by the center of its box', () => {
    const element = { type: 'element', geometry: { x: 40, y: 40, width: 20, height: 20 } }
    expect(describePosition(element, 100, 100)).toBe('center (~50% from top, ~50% from left)')
  })

  it('describes a pin dead center as "center"', () => {
    const pin = { type: 'pin', geometry: { x: 50, y: 50 } }
    expect(describePosition(pin, 100, 100)).toBe('center (~50% from top, ~50% from left)')
  })

  it('describes a pin on the middle-right edge without a vertical qualifier', () => {
    const pin = { type: 'pin', geometry: { x: 90, y: 50 } }
    expect(describePosition(pin, 100, 100)).toBe('right (~50% from top, ~90% from left)')
  })

  it('uses the box center', () => {
    const box = { type: 'box', geometry: { x: 0, y: 0, width: 20, height: 20 } }
    expect(describePosition(box, 100, 100)).toBe('top left (~10% from top, ~10% from left)')
  })

  it('uses the arrow midpoint', () => {
    const arrow = { type: 'arrow', geometry: { x1: 80, y1: 80, x2: 100, y2: 100 } }
    expect(describePosition(arrow, 100, 100)).toBe('bottom right (~90% from top, ~90% from left)')
  })

  it('uses the freehand centroid', () => {
    const freehand = { type: 'freehand', geometry: { points: [{ x: 0, y: 0 }, { x: 20, y: 20 }] } }
    expect(describePosition(freehand, 100, 100)).toBe('top left (~10% from top, ~10% from left)')
  })

  it('uses the highlighter centroid, like a freehand mark', () => {
    const highlighter = { type: 'highlighter', geometry: { points: [{ x: 0, y: 0 }, { x: 20, y: 20 }] } }
    expect(describePosition(highlighter, 100, 100)).toBe('top left (~10% from top, ~10% from left)')
  })

  it('describes a general comment without touching its (absent) geometry', () => {
    const comment = { type: 'comment', geometry: null }
    expect(describePosition(comment, 100, 100)).toBe('the whole image')
  })
})

describe('findNearbyAnnotationNumbers', () => {
  it('flags two annotations positioned close together', () => {
    const a = { type: 'pin', geometry: { x: 85, y: 15 } }
    const b = { type: 'pin', geometry: { x: 90, y: 18 } }
    expect(findNearbyAnnotationNumbers([a, b], 100, 100)).toEqual([[2], [1]])
  })

  it('leaves annotations that are far apart alone', () => {
    const a = { type: 'pin', geometry: { x: 10, y: 10 } }
    const b = { type: 'pin', geometry: { x: 90, y: 90 } }
    expect(findNearbyAnnotationNumbers([a, b], 100, 100)).toEqual([[], []])
  })

  it('only flags the pair that is actually close in a group of three', () => {
    const a = { type: 'pin', geometry: { x: 85, y: 15 } }
    const b = { type: 'pin', geometry: { x: 90, y: 18 } }
    const c = { type: 'pin', geometry: { x: 10, y: 90 } }
    expect(findNearbyAnnotationNumbers([a, b, c], 100, 100)).toEqual([[2], [1], []])
  })

  it('never crashes on a general comment (no geometry) and never flags it as "nearby" a real annotation', () => {
    const pin = { type: 'pin', geometry: { x: 10, y: 10 } }
    const comment = { type: 'comment', geometry: null }
    expect(findNearbyAnnotationNumbers([pin, comment], 100, 100)).toEqual([[], []])
  })
})
