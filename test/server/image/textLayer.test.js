import { describe, it, expect } from 'vitest'
import { buildTextElements } from '../../../server/image/pdf/textLayer.js'

// A run as the render worker reports it: text, font size and box in page pixels.
const run = (str, x, y, { size = 20, width = str.length * size * 0.5 } = {}) => ({
  str, fontSize: size, box: { x, y, width, height: size }
})

describe('buildTextElements', () => {
  it('merges runs on one baseline into a line and lines of one column into a block', () => {
    const elements = buildTextElements({
      runs: [
        run('North grew', 100, 300), run('12%', 210, 300),
        run('South stayed', 100, 324), run('flat', 240, 324)
      ]
    })
    expect(elements).toEqual([
      { tag: 'text', name: 'North grew 12% South stayed flat', selector: '', box: { x: 100, y: 300, width: 180, height: 44 } }
    ])
  })

  it('names a block in a clearly larger font a heading, and keeps it apart from the body', () => {
    const elements = buildTextElements({
      runs: [
        run('Revenue by region', 100, 100, { size: 44 }),
        run('North grew 12%', 100, 200), run('South stayed flat', 100, 224), run('East doubled', 100, 248)
      ]
    })
    expect(elements.map((e) => [e.tag, e.name])).toEqual([
      ['heading', 'Revenue by region'],
      ['text', 'North grew 12% South stayed flat East doubled']
    ])
  })

  it('drops whitespace runs and leading bullets from the name', () => {
    const elements = buildTextElements({ runs: [run('•', 80, 300), run(' ', 95, 300), run('North grew', 110, 300)] })
    expect(elements.map((e) => e.name)).toEqual(['North grew'])
  })

  it('keeps columns apart', () => {
    const elements = buildTextElements({
      runs: [run('Left column', 100, 300), run('Right column', 900, 300), run('more left', 100, 324), run('more right', 900, 324)]
    })
    expect(elements.map((e) => e.name)).toEqual(['Left column more left', 'Right column more right'])
  })

  it('keeps paragraphs with a blank line between them apart', () => {
    const elements = buildTextElements({ runs: [run('First paragraph', 100, 300), run('Second paragraph', 100, 380)] })
    expect(elements).toHaveLength(2)
  })

  it('caps long names', () => {
    const [element] = buildTextElements({ runs: [run('word '.repeat(40).trim(), 100, 300)] })
    expect(element.name.length).toBeLessThanOrEqual(80)
    expect(element.name.endsWith('…')).toBe(true)
  })

  it('adds links with their target as name', () => {
    const elements = buildTextElements({ links: [{ url: 'https://example.com/report', box: { x: 1, y: 2, width: 3, height: 4 } }] })
    expect(elements).toEqual([{ tag: 'link', name: 'https://example.com/report', selector: '', box: { x: 1, y: 2, width: 3, height: 4 } }])
  })

  it('returns nothing for a page without text', () => {
    expect(buildTextElements({ runs: [], links: [] })).toEqual([])
  })
})
