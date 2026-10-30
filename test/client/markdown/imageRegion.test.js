import { describe, it, expect } from 'vitest'
import { toImageRegion, regionStyle } from '../../../client/markdown/src/utils/imageRegion.js'

const shown = { width: 600, height: 400 }
const natural = { width: 1200, height: 800 }

describe('toImageRegion', () => {
  it('scales a box dragged on the shown image to the pixels of the image itself', () => {
    const region = toImageRegion({ x: 60, y: 20 }, { x: 360, y: 200 }, shown, natural)
    expect(region).toEqual({ x: 120, y: 40, width: 600, height: 360, imageWidth: 1200, imageHeight: 800 })
  })

  it('reads a box dragged from the bottom right to the top left the same way', () => {
    const forward = toImageRegion({ x: 60, y: 20 }, { x: 360, y: 200 }, shown, natural)
    expect(toImageRegion({ x: 360, y: 200 }, { x: 60, y: 20 }, shown, natural)).toEqual(forward)
  })

  it('keeps the box inside the image when the pointer leaves it', () => {
    const region = toImageRegion({ x: 500, y: 300 }, { x: 900, y: 700 }, shown, natural)
    expect(region).toMatchObject({ x: 1000, y: 600, width: 200, height: 200 })
  })

  it('ignores a click or a box too small to mean anything', () => {
    expect(toImageRegion({ x: 10, y: 10 }, { x: 12, y: 200 }, shown, natural)).toBeNull()
    expect(toImageRegion({ x: 10, y: 10 }, { x: 10, y: 10 }, shown, natural)).toBeNull()
  })

  it('has nothing to measure on an image that is not loaded', () => {
    expect(toImageRegion({ x: 0, y: 0 }, { x: 50, y: 50 }, { width: 0, height: 0 }, natural)).toBeNull()
    expect(toImageRegion({ x: 0, y: 0 }, { x: 50, y: 50 }, shown, { width: 0, height: 0 })).toBeNull()
  })
})

describe('regionStyle', () => {
  it('places a box over the image in percent, so it follows the image when it scales', () => {
    const region = { x: 120, y: 40, width: 600, height: 360, imageWidth: 1200, imageHeight: 800 }
    expect(regionStyle(region)).toEqual({ left: '10%', top: '5%', width: '50%', height: '45%' })
  })
})
