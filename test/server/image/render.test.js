import { describe, it, expect } from 'vitest'
import { loadImage, createCanvas } from '@napi-rs/canvas'
import { flattenAnnotations, composeContactSheet, CONTACT_SHEET_GAP, CONTACT_SHEET_LABEL_HEIGHT } from '../../../server/image/render.js'
import { makeFixturePng } from '../../helpers/fixtureImage.js'

describe('flattenAnnotations', () => {
  it('returns a PNG of the same dimensions when there are no annotations', async () => {
    const source = makeFixturePng(40, 30)
    const result = await flattenAnnotations(source, [])
    const decoded = await loadImage(result)
    expect(decoded.width).toBe(40)
    expect(decoded.height).toBe(30)
  })

  it('changes the pixel bytes when a box annotation is drawn', async () => {
    const source = makeFixturePng(40, 30, '#000000')
    const box = { type: 'box', color: '#ff0000', geometry: { x: 5, y: 5, width: 20, height: 15 } }
    const result = await flattenAnnotations(source, [box])
    expect(Buffer.compare(result, source)).not.toBe(0)
  })

  it('draws a selected element as an outline with a light fill inside it', async () => {
    const source = makeFixturePng(40, 30, '#000000')
    const element = { type: 'element', color: '#ff0000', geometry: { x: 5, y: 5, width: 30, height: 20 } }
    const decoded = await loadImage(await flattenAnnotations(source, [element]))
    const ctx = createCanvas(decoded.width, decoded.height).getContext('2d')
    ctx.drawImage(decoded, 0, 0)
    const [red, green, blue] = ctx.getImageData(20, 15, 1, 1).data
    expect(red).toBeGreaterThan(0)
    expect(red).toBeLessThan(255)
    expect([green, blue]).toEqual([0, 0])
  })

  it('handles an arrow annotation without throwing', async () => {
    const source = makeFixturePng(40, 30)
    const arrow = { type: 'arrow', color: '#ff0000', geometry: { x1: 0, y1: 0, x2: 39, y2: 29 } }
    await expect(flattenAnnotations(source, [arrow])).resolves.toBeInstanceOf(Buffer)
  })

  it('handles a freehand annotation without throwing', async () => {
    const source = makeFixturePng(40, 30)
    const freehand = {
      type: 'freehand',
      color: '#ff0000',
      geometry: { points: [{ x: 2, y: 2 }, { x: 10, y: 8 }, { x: 20, y: 4 }] }
    }
    await expect(flattenAnnotations(source, [freehand])).resolves.toBeInstanceOf(Buffer)
  })

  it('handles a pin annotation and numbers it', async () => {
    const source = makeFixturePng(40, 30)
    const pin = { type: 'pin', color: '#ff0000', text: 'note', geometry: { x: 20, y: 15 } }
    await expect(flattenAnnotations(source, [pin])).resolves.toBeInstanceOf(Buffer)
  })

  it('ignores a degenerate freehand mark with fewer than 2 points', async () => {
    const source = makeFixturePng(40, 30)
    const freehand = { type: 'freehand', geometry: { points: [{ x: 2, y: 2 }] } }
    await expect(flattenAnnotations(source, [freehand])).resolves.toBeInstanceOf(Buffer)
  })

  it('handles a highlighter annotation without throwing', async () => {
    const source = makeFixturePng(40, 30)
    const highlighter = {
      type: 'highlighter',
      color: '#ffff00',
      geometry: { points: [{ x: 2, y: 2 }, { x: 10, y: 8 }, { x: 20, y: 4 }] }
    }
    await expect(flattenAnnotations(source, [highlighter])).resolves.toBeInstanceOf(Buffer)
  })

  it('ignores a degenerate highlighter mark with fewer than 2 points', async () => {
    const source = makeFixturePng(40, 30)
    const highlighter = { type: 'highlighter', geometry: { points: [{ x: 2, y: 2 }] } }
    await expect(flattenAnnotations(source, [highlighter])).resolves.toBeInstanceOf(Buffer)
  })

  it('does not leak the highlighter\'s translucency into annotations drawn after it', async () => {
    const source = makeFixturePng(40, 30, '#000000')
    const highlighter = { type: 'highlighter', color: '#ffff00', geometry: { points: [{ x: 2, y: 2 }, { x: 30, y: 2 }] } }
    const box = { type: 'box', color: '#00ff00', geometry: { x: 20, y: 10, width: 10, height: 10 } }
    const result = await flattenAnnotations(source, [highlighter, box])
    const decoded = await loadImage(result)
    const canvas = createCanvas(decoded.width, decoded.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(decoded, 0, 0)
    const [, , , alpha] = ctx.getImageData(20, 10, 1, 1).data
    expect(alpha).toBe(255)
  })

  it('handles a dimension-style arrow without throwing', async () => {
    const source = makeFixturePng(40, 30)
    const arrow = { type: 'arrow', arrowStyle: 'dimension', color: '#ff0000', geometry: { x1: 0, y1: 0, x2: 39, y2: 29 } }
    await expect(flattenAnnotations(source, [arrow])).resolves.toBeInstanceOf(Buffer)
  })

  it('handles a zero-length dimension-style arrow without throwing', async () => {
    const source = makeFixturePng(40, 30)
    const arrow = { type: 'arrow', arrowStyle: 'dimension', color: '#ff0000', geometry: { x1: 5, y1: 5, x2: 5, y2: 5 } }
    await expect(flattenAnnotations(source, [arrow])).resolves.toBeInstanceOf(Buffer)
  })

  it('handles a headless (\'none\') arrow without throwing', async () => {
    const source = makeFixturePng(40, 30)
    const arrow = { type: 'arrow', arrowStyle: 'none', color: '#ff0000', geometry: { x1: 0, y1: 0, x2: 39, y2: 29 } }
    await expect(flattenAnnotations(source, [arrow])).resolves.toBeInstanceOf(Buffer)
  })

  it('handles a double-headed arrow without throwing', async () => {
    const source = makeFixturePng(40, 30)
    const arrow = { type: 'arrow', arrowStyle: 'double', color: '#ff0000', geometry: { x1: 0, y1: 0, x2: 39, y2: 29 } }
    await expect(flattenAnnotations(source, [arrow])).resolves.toBeInstanceOf(Buffer)
  })

  it('handles a zero-length double-headed arrow without throwing', async () => {
    const source = makeFixturePng(40, 30)
    const arrow = { type: 'arrow', arrowStyle: 'double', color: '#ff0000', geometry: { x1: 5, y1: 5, x2: 5, y2: 5 } }
    await expect(flattenAnnotations(source, [arrow])).resolves.toBeInstanceOf(Buffer)
  })

  it('falls back to a single arrowhead for an unknown arrowStyle', async () => {
    const source = makeFixturePng(40, 30)
    const arrow = { type: 'arrow', arrowStyle: 'triangle', color: '#ff0000', geometry: { x1: 0, y1: 0, x2: 39, y2: 29 } }
    await expect(flattenAnnotations(source, [arrow])).resolves.toBeInstanceOf(Buffer)
  })

  it('treats an absent strokeWidth as exactly the same as the client default (3)', async () => {
    const source = makeFixturePng(40, 30, '#000000')
    const implicit = { type: 'box', color: '#ff0000', geometry: { x: 5, y: 5, width: 20, height: 15 } }
    const explicit = { type: 'box', color: '#ff0000', strokeWidth: 3, geometry: { x: 5, y: 5, width: 20, height: 15 } }
    const implicitResult = await flattenAnnotations(source, [implicit])
    const explicitResult = await flattenAnnotations(source, [explicit])
    expect(Buffer.compare(implicitResult, explicitResult)).toBe(0)
  })

  it('draws a visibly thicker stroke for a box with a larger configured strokeWidth', async () => {
    const source = makeFixturePng(40, 30, '#000000')
    const thin = { type: 'box', color: '#ff0000', geometry: { x: 5, y: 5, width: 20, height: 15 } }
    const thick = { type: 'box', color: '#ff0000', strokeWidth: 20, geometry: { x: 5, y: 5, width: 20, height: 15 } }
    const thinResult = await flattenAnnotations(source, [thin])
    const thickResult = await flattenAnnotations(source, [thick])
    expect(Buffer.compare(thinResult, thickResult)).not.toBe(0)
  })

  it('does not leak a dashed line style into annotations drawn after it', async () => {
    const source = makeFixturePng(60, 40, '#000000')
    const dashedBox = { type: 'box', color: '#ff0000', dashStyle: 'dashed', geometry: { x: 2, y: 2, width: 10, height: 10 } }
    // A thick stroke on the second box so sampling deep inside its band
    // (well clear of both antialiased edges and the numbered badge, which
    // sits at the box's top-left corner) is unambiguous.
    const solidBox = { type: 'box', color: '#00ff00', strokeWidth: 20, geometry: { x: 20, y: 5, width: 20, height: 15 } }
    const result = await flattenAnnotations(source, [dashedBox, solidBox])
    const decoded = await loadImage(result)
    const canvas = createCanvas(decoded.width, decoded.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(decoded, 0, 0)
    // Sample along the bottom edge (y = 5 + 15 = 20, the center of the
    // 20-wide stroke band there): every point should be solid green. A
    // leaked dash pattern from the earlier dashed annotation would punch
    // gaps showing the background instead.
    for (let x = 22; x <= 38; x += 2) {
      const [r, g, b] = ctx.getImageData(x, 20, 1, 1).data
      expect([r, g, b]).toEqual([0, 255, 0])
    }
  })

  it('appends a legend below the image listing each annotation\'s comment', async () => {
    const source = makeFixturePng(200, 100)
    const box = { type: 'box', color: '#ff0000', text: 'Move this up', geometry: { x: 5, y: 5, width: 20, height: 15 } }
    const pin = { type: 'pin', color: '#00ff00', text: '', geometry: { x: 50, y: 50 } }
    const result = await flattenAnnotations(source, [box, pin])
    const decoded = await loadImage(result)
    expect(decoded.width).toBe(200)
    expect(decoded.height).toBeGreaterThan(100)
  })

  it('does not add a legend when there are no annotations', async () => {
    const source = makeFixturePng(200, 100)
    const result = await flattenAnnotations(source, [])
    const decoded = await loadImage(result)
    expect(decoded.height).toBe(100)
  })
})

describe('flattenAnnotations with explicit numbers', () => {
  it('draws the given number instead of the array position', async () => {
    const source = makeFixturePng(60, 40, '#000000')
    const pin = { type: 'pin', color: '#ff0000', geometry: { x: 30, y: 20 } }
    const byPosition = await flattenAnnotations(source, [pin])
    const byNumber = await flattenAnnotations(source, [pin], [7])
    expect(Buffer.compare(byPosition, byNumber)).not.toBe(0)
  })

  it('lists a timed comment in the legend without drawing anything on the frame', async () => {
    const source = makeFixturePng(200, 100, '#000000')
    const result = await flattenAnnotations(source, [{ type: 'comment', geometry: null, text: 'spinner hangs', time: 1, endTime: 2 }], [3])
    const decoded = await loadImage(result)
    expect(decoded.height).toBeGreaterThan(100)
  })
})

describe('composeContactSheet', () => {
  it('lays tiles out in a grid scaled to the tile width, with a label bar under each', async () => {
    const tiles = Array.from({ length: 5 }, (_, i) => ({ buffer: makeFixturePng(200, 100), label: `00:0${i}.000` }))
    const result = await composeContactSheet(tiles, { columns: 3, tileWidth: 100 })
    const decoded = await loadImage(result)
    expect(decoded.width).toBe(3 * 100 + 4 * CONTACT_SHEET_GAP)
    expect(decoded.height).toBe(2 * (50 + CONTACT_SHEET_LABEL_HEIGHT) + 3 * CONTACT_SHEET_GAP)
  })

  it('fits tiles of mixed sizes into cells sized for the tallest aspect ratio, without distorting them', async () => {
    const tiles = [
      { buffer: makeFixturePng(200, 100, '#ff0000'), label: 'landscape' },
      { buffer: makeFixturePng(100, 200, '#00ff00'), label: 'portrait' }
    ]
    const result = await composeContactSheet(tiles, { columns: 2, tileWidth: 100 })
    const decoded = await loadImage(result)
    // Cells are 100 wide and 200 tall (portrait ratio 2:1).
    expect(decoded.width).toBe(2 * 100 + 3 * CONTACT_SHEET_GAP)
    expect(decoded.height).toBe(200 + CONTACT_SHEET_LABEL_HEIGHT + 2 * CONTACT_SHEET_GAP)

    const ctx = createCanvas(decoded.width, decoded.height).getContext('2d')
    ctx.drawImage(decoded, 0, 0)
    const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3))
    const cellTop = CONTACT_SHEET_GAP
    // The landscape tile is 100x50, centred vertically in its 200px cell.
    expect(pixel(CONTACT_SHEET_GAP + 50, cellTop + 100)).toEqual([255, 0, 0])
    expect(pixel(CONTACT_SHEET_GAP + 50, cellTop + 10)).not.toEqual([255, 0, 0])
    // The portrait tile fills its cell: 100x200.
    expect(pixel(2 * CONTACT_SHEET_GAP + 150, cellTop + 10)).toEqual([0, 255, 0])
    expect(pixel(2 * CONTACT_SHEET_GAP + 150, cellTop + 190)).toEqual([0, 255, 0])
  })

  it('never upscales a tile beyond the source width', async () => {
    const result = await composeContactSheet([{ buffer: makeFixturePng(80, 40), label: 'x' }], { columns: 1, tileWidth: 400 })
    const decoded = await loadImage(result)
    expect(decoded.width).toBe(80 + 2 * CONTACT_SHEET_GAP)
  })
})
