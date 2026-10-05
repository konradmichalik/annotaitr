import { describe, it, expect } from 'vitest'
import {
  clampPoint, distance, boxFromPoints,
  annotationCentroid, annotationBottomAnchor, annotationTopAnchor, translateGeometry, hitTestAnnotation, findAnnotationAt,
  resizeGeometry, freehandBounds, isPointsGeometry, dimensionCapLines, dimensionTickLengthFor
} from '../../../client/image/src/utils/drawing.js'

describe('clampPoint', () => {
  it('leaves an in-bounds point untouched', () => {
    expect(clampPoint({ x: 10, y: 10 }, 100, 100)).toEqual({ x: 10, y: 10 })
  })

  it('clamps negative coordinates to 0', () => {
    expect(clampPoint({ x: -5, y: -5 }, 100, 100)).toEqual({ x: 0, y: 0 })
  })

  it('clamps coordinates beyond the image bounds', () => {
    expect(clampPoint({ x: 200, y: 300 }, 100, 100)).toEqual({ x: 100, y: 100 })
  })
})

describe('distance', () => {
  it('computes Euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe('boxFromPoints', () => {
  it('normalizes a drag from bottom-right to top-left', () => {
    expect(boxFromPoints({ x: 50, y: 50 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 40, height: 30 })
  })

  it('normalizes a drag already going top-left to bottom-right', () => {
    expect(boxFromPoints({ x: 10, y: 20 }, { x: 50, y: 50 })).toEqual({ x: 10, y: 20, width: 40, height: 30 })
  })
})

describe('annotationCentroid', () => {
  it('uses the point itself for a pin', () => {
    expect(annotationCentroid({ type: 'pin', geometry: { x: 5, y: 7 } })).toEqual({ x: 5, y: 7 })
  })

  it('uses the center for a box', () => {
    expect(annotationCentroid({ type: 'box', geometry: { x: 0, y: 0, width: 20, height: 10 } })).toEqual({ x: 10, y: 5 })
  })

  it('uses the midpoint for an arrow', () => {
    expect(annotationCentroid({ type: 'arrow', geometry: { x1: 0, y1: 0, x2: 20, y2: 10 } })).toEqual({ x: 10, y: 5 })
  })

  it('uses the point average for a freehand mark', () => {
    const geometry = { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }] }
    expect(annotationCentroid({ type: 'freehand', geometry })).toEqual({ x: 10, y: 10 })
  })

  it('uses the point average for a highlighter mark, like a freehand mark', () => {
    const geometry = { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }] }
    expect(annotationCentroid({ type: 'highlighter', geometry })).toEqual({ x: 10, y: 10 })
  })
})

describe('annotationBottomAnchor', () => {
  it('sits below a pin\'s point', () => {
    expect(annotationBottomAnchor({ type: 'pin', geometry: { x: 5, y: 5 } })).toEqual({ x: 5, y: 23 })
  })

  it('sits at the bottom-center of a box, not its center', () => {
    const anchor = annotationBottomAnchor({ type: 'box', geometry: { x: 0, y: 0, width: 20, height: 10 } })
    expect(anchor).toEqual({ x: 10, y: 10 })
  })

  it('sits at the lower endpoint\'s height for an arrow, regardless of drag direction', () => {
    const upward = annotationBottomAnchor({ type: 'arrow', geometry: { x1: 0, y1: 20, x2: 20, y2: 0 } })
    expect(upward).toEqual({ x: 10, y: 20 })
  })

  it('sits below the lowest point of a freehand mark', () => {
    const geometry = { points: [{ x: 0, y: 0 }, { x: 10, y: 30 }, { x: 20, y: 10 }] }
    expect(annotationBottomAnchor({ type: 'freehand', geometry })).toEqual({ x: 10, y: 30 })
  })
})

describe('annotationTopAnchor', () => {
  it('sits above a pin\'s point', () => {
    expect(annotationTopAnchor({ type: 'pin', geometry: { x: 5, y: 5 } })).toEqual({ x: 5, y: -9 })
  })

  it('sits at the top-center of a box, not its center', () => {
    const anchor = annotationTopAnchor({ type: 'box', geometry: { x: 0, y: 0, width: 20, height: 10 } })
    expect(anchor).toEqual({ x: 10, y: 0 })
  })

  it('sits at the higher endpoint\'s height for an arrow, regardless of drag direction', () => {
    const upward = annotationTopAnchor({ type: 'arrow', geometry: { x1: 0, y1: 20, x2: 20, y2: 0 } })
    expect(upward).toEqual({ x: 10, y: 0 })
  })

  it('sits above the highest point of a freehand mark', () => {
    const geometry = { points: [{ x: 0, y: 0 }, { x: 10, y: 30 }, { x: 20, y: 10 }] }
    expect(annotationTopAnchor({ type: 'freehand', geometry })).toEqual({ x: 10, y: 0 })
  })
})

describe('translateGeometry', () => {
  it('shifts a pin', () => {
    expect(translateGeometry('pin', { x: 5, y: 5 }, 3, -2)).toEqual({ x: 8, y: 3 })
  })

  it('shifts a box without changing its size', () => {
    expect(translateGeometry('box', { x: 5, y: 5, width: 20, height: 10 }, 3, -2))
      .toEqual({ x: 8, y: 3, width: 20, height: 10 })
  })

  it('shifts both ends of an arrow', () => {
    expect(translateGeometry('arrow', { x1: 0, y1: 0, x2: 10, y2: 10 }, 5, 5))
      .toEqual({ x1: 5, y1: 5, x2: 15, y2: 15 })
  })

  it('shifts every point of a freehand mark', () => {
    const geometry = { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
    expect(translateGeometry('freehand', geometry, 2, 3)).toEqual({ points: [{ x: 2, y: 3 }, { x: 12, y: 13 }] })
  })

  it('shifts every point of a highlighter mark, like a freehand mark', () => {
    const geometry = { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
    expect(translateGeometry('highlighter', geometry, 2, 3)).toEqual({ points: [{ x: 2, y: 3 }, { x: 12, y: 13 }] })
  })
})

describe('isPointsGeometry', () => {
  it('is true for freehand and highlighter, false for everything else', () => {
    expect(isPointsGeometry('freehand')).toBe(true)
    expect(isPointsGeometry('highlighter')).toBe(true)
    expect(isPointsGeometry('box')).toBe(false)
    expect(isPointsGeometry('arrow')).toBe(false)
    expect(isPointsGeometry('pin')).toBe(false)
  })
})

describe('hitTestAnnotation', () => {
  it('hits inside a box, not outside it', () => {
    const box = { type: 'box', geometry: { x: 10, y: 10, width: 20, height: 20 } }
    expect(hitTestAnnotation({ x: 15, y: 15 }, box)).toBe(true)
    expect(hitTestAnnotation({ x: 100, y: 100 }, box)).toBe(false)
  })

  it('hits near an arrow line, not far from it', () => {
    const arrow = { type: 'arrow', geometry: { x1: 0, y1: 0, x2: 100, y2: 0 } }
    expect(hitTestAnnotation({ x: 50, y: 2 }, arrow)).toBe(true)
    expect(hitTestAnnotation({ x: 50, y: 50 }, arrow)).toBe(false)
  })

  it('hits within a pin\'s radius, not outside it', () => {
    const pin = { type: 'pin', geometry: { x: 50, y: 50 } }
    expect(hitTestAnnotation({ x: 55, y: 50 }, pin)).toBe(true)
    expect(hitTestAnnotation({ x: 90, y: 90 }, pin)).toBe(false)
  })

  it('hits near any segment of a freehand mark', () => {
    const freehand = { type: 'freehand', geometry: { points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }] } }
    expect(hitTestAnnotation({ x: 50, y: 25 }, freehand)).toBe(true)
    expect(hitTestAnnotation({ x: 25, y: 25 }, freehand)).toBe(false)
  })

  it('gives a highlighter a wider hit tolerance than a freehand mark, to match its fat stroke', () => {
    const geometry = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }
    const point = { x: 50, y: 9 }
    expect(hitTestAnnotation(point, { type: 'freehand', geometry })).toBe(false)
    expect(hitTestAnnotation(point, { type: 'highlighter', geometry })).toBe(true)
  })

  it('widens hit tolerance for a thick freehand mark beyond the default', () => {
    const geometry = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }
    const point = { x: 50, y: 10 }
    expect(hitTestAnnotation(point, { type: 'freehand', geometry })).toBe(false)
    expect(hitTestAnnotation(point, { type: 'freehand', geometry, strokeWidth: 20 })).toBe(true)
  })

  it('floors a thin highlighter\'s hit tolerance at the global minimum, never narrower than any other line', () => {
    const geometry = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }
    const point = { x: 50, y: 8 }
    expect(hitTestAnnotation(point, { type: 'highlighter', geometry, strokeWidth: 10 })).toBe(true)
  })

  it('never hits a general comment (no geometry, not drawn on the canvas at all)', () => {
    const comment = { type: 'comment', geometry: null }
    expect(hitTestAnnotation({ x: 0, y: 0 }, comment)).toBe(false)
  })

  it('includes a dimension arrow\'s perpendicular ticks in hit-testing, not just the shaft', () => {
    const geometry = { x1: 0, y1: 0, x2: 100, y2: 0 }
    // At strokeWidth 15 the tick half-length (35) well exceeds the shaft's
    // own tolerance (9.5), so this point only hits through the tick itself.
    const nearTickTip = { x: 0, y: 34 }
    const dimensionArrow = { type: 'arrow', arrowStyle: 'dimension', strokeWidth: 15, geometry }
    const headArrow = { type: 'arrow', arrowStyle: 'head', strokeWidth: 15, geometry }
    expect(hitTestAnnotation(nearTickTip, dimensionArrow)).toBe(true)
    expect(hitTestAnnotation(nearTickTip, headArrow)).toBe(false)
  })
})

describe('findAnnotationAt', () => {
  it('returns the topmost (last) annotation when several overlap', () => {
    const bottom = { id: 'a1', type: 'box', geometry: { x: 0, y: 0, width: 50, height: 50 } }
    const top = { id: 'a2', type: 'box', geometry: { x: 10, y: 10, width: 20, height: 20 } }
    expect(findAnnotationAt({ x: 15, y: 15 }, [bottom, top])).toBe(top)
  })

  it('returns null when nothing is hit', () => {
    const box = { id: 'a1', type: 'box', geometry: { x: 0, y: 0, width: 10, height: 10 } }
    expect(findAnnotationAt({ x: 500, y: 500 }, [box])).toBeNull()
  })
})

describe('resizeGeometry', () => {
  const box = { x: 10, y: 10, width: 20, height: 20 }

  it('resizes a box from its nw handle, anchoring the opposite (se) corner', () => {
    expect(resizeGeometry('box', box, 'nw', { x: 0, y: 0 })).toEqual({ x: 0, y: 0, width: 30, height: 30 })
  })

  it('resizes a box from its se handle, anchoring the opposite (nw) corner', () => {
    expect(resizeGeometry('box', box, 'se', { x: 50, y: 50 })).toEqual({ x: 10, y: 10, width: 40, height: 40 })
  })

  it('resizes a box from its ne handle, anchoring the opposite (sw) corner', () => {
    expect(resizeGeometry('box', box, 'ne', { x: 40, y: 5 })).toEqual({ x: 10, y: 5, width: 30, height: 25 })
  })

  it('resizes a box from its sw handle, anchoring the opposite (ne) corner', () => {
    expect(resizeGeometry('box', box, 'sw', { x: 5, y: 40 })).toEqual({ x: 5, y: 10, width: 25, height: 30 })
  })

  it('moves an arrow\'s start point, keeping the end fixed', () => {
    const arrow = { x1: 0, y1: 0, x2: 10, y2: 10 }
    expect(resizeGeometry('arrow', arrow, 'start', { x: 5, y: 5 })).toEqual({ x1: 5, y1: 5, x2: 10, y2: 10 })
  })

  it('moves an arrow\'s end point, keeping the start fixed', () => {
    const arrow = { x1: 0, y1: 0, x2: 10, y2: 10 }
    expect(resizeGeometry('arrow', arrow, 'end', { x: 20, y: 20 })).toEqual({ x1: 0, y1: 0, x2: 20, y2: 20 })
  })

  it('scales a freehand mark from its se handle, anchoring the nw corner of its bounds', () => {
    // bounds: (0,0) to (10,10)
    const freehand = { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 0 }] }
    const result = resizeGeometry('freehand', freehand, 'se', { x: 20, y: 20 })
    // scale x2, y2 from anchor (0,0)
    expect(result.points).toEqual([{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 10, y: 0 }])
  })

  it('scales a freehand mark from its nw handle, anchoring the se corner of its bounds', () => {
    const freehand = { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
    const result = resizeGeometry('freehand', freehand, 'nw', { x: -10, y: -10 })
    // anchor is (10,10); old span from anchor to nw (0,0) was (-10,-10); new span is (-20,-20) -> scale x2
    expect(result.points).toEqual([{ x: -10, y: -10 }, { x: 10, y: 10 }])
  })

  it('does not divide by zero when a freehand mark is a single vertical or horizontal line', () => {
    const vertical = { points: [{ x: 5, y: 0 }, { x: 5, y: 10 }] }
    const result = resizeGeometry('freehand', vertical, 'se', { x: 5, y: 20 })
    expect(result.points[0].x).toBe(5)
    expect(result.points[1].y).toBe(20)
  })

  it('scales a highlighter mark exactly like a freehand mark', () => {
    const highlighter = { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 0 }] }
    const result = resizeGeometry('highlighter', highlighter, 'se', { x: 20, y: 20 })
    expect(result.points).toEqual([{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 10, y: 0 }])
  })
})

describe('dimensionCapLines', () => {
  it('returns vertical ticks for a horizontal shaft', () => {
    const ticks = dimensionCapLines({ x1: 0, y1: 0, x2: 100, y2: 0 }, 10)
    expect(ticks).toEqual([
      { x1: 0, y1: -5, x2: 0, y2: 5 },
      { x1: 100, y1: -5, x2: 100, y2: 5 }
    ])
  })

  it('returns horizontal ticks for a vertical shaft', () => {
    const ticks = dimensionCapLines({ x1: 0, y1: 0, x2: 0, y2: 100 }, 10)
    expect(ticks).toEqual([
      { x1: 5, y1: 0, x2: -5, y2: 0 },
      { x1: 5, y1: 100, x2: -5, y2: 100 }
    ])
  })

  it('centers each tick on its endpoint for a diagonal shaft', () => {
    const ticks = dimensionCapLines({ x1: 0, y1: 0, x2: 10, y2: 10 }, 10)
    const midpointOf = (t) => ({ x: (t.x1 + t.x2) / 2, y: (t.y1 + t.y2) / 2 })
    expect(midpointOf(ticks[0])).toEqual({ x: 0, y: 0 })
    expect(midpointOf(ticks[1])).toEqual({ x: 10, y: 10 })
  })

  it('returns null for a zero-length arrow', () => {
    expect(dimensionCapLines({ x1: 5, y1: 5, x2: 5, y2: 5 })).toBeNull()
  })
})

describe('dimensionTickLengthFor', () => {
  it('preserves the historical 14-unit tick length at the default stroke width', () => {
    expect(dimensionTickLengthFor({ type: 'arrow' })).toBe(14)
  })

  it('scales proportionally with a configured stroke width', () => {
    expect(dimensionTickLengthFor({ type: 'arrow', strokeWidth: 6 })).toBe(28)
  })
})

describe('freehandBounds', () => {
  it('computes the axis-aligned bounding box of a set of points', () => {
    const points = [{ x: 5, y: 10 }, { x: 20, y: 2 }, { x: 8, y: 30 }]
    expect(freehandBounds(points)).toEqual({ x: 5, y: 2, width: 15, height: 28 })
  })
})

describe('a selected page element', () => {
  const element = { type: 'element', geometry: { x: 10, y: 20, width: 40, height: 30 } }

  it('is hit anywhere inside its box, like a drawn box', () => {
    expect(hitTestAnnotation({ x: 30, y: 35 }, element)).toBe(true)
    expect(hitTestAnnotation({ x: 5, y: 35 }, element)).toBe(false)
  })

  it('anchors its popover and toolbar like a box', () => {
    expect(annotationCentroid(element)).toEqual({ x: 30, y: 35 })
    expect(annotationBottomAnchor(element)).toEqual({ x: 30, y: 50 })
    expect(annotationTopAnchor(element)).toEqual({ x: 30, y: 20 })
  })
})
