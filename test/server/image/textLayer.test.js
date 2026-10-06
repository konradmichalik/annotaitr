import { describe, it, expect } from 'vitest'
import { buildTextLayer } from '../../../server/image/pdf/textLayer.js'

const buildTextElements = (page) => buildTextLayer(page).elements

// A run as the render worker reports it: text, font size and box in page pixels.
const run = (str, x, y, { size = 20, width = str.length * size * 0.5 } = {}) => ({
  str, fontSize: size, box: { x, y, width, height: size }
})

describe('buildTextLayer elements', () => {
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
    const elements = buildTextLayer({ runs: [run('•', 80, 300), run(' ', 95, 300), run('North grew', 110, 300)] }).elements
    expect(elements.map((e) => e.name)).toEqual(['North grew'])
  })

  it('keeps columns apart', () => {
    const elements = buildTextElements({
      runs: [run('Left column', 100, 300), run('Right column', 900, 300), run('more left', 100, 324), run('more right', 900, 324)]
    })
    expect(elements.map((e) => e.name)).toEqual(['Left column more left', 'Right column more right'])
  })

  it('keeps paragraphs with a blank line between them apart', () => {
    const elements = buildTextLayer({ runs: [run('First paragraph', 100, 300), run('Second paragraph', 100, 380)] }).elements
    expect(elements).toHaveLength(2)
  })

  it('caps long names', () => {
    const [element] = buildTextLayer({ runs: [run('word '.repeat(40).trim(), 100, 300)] }).elements
    expect(element.name.length).toBeLessThanOrEqual(80)
    expect(element.name.endsWith('…')).toBe(true)
  })

  it('adds links with their target as name', () => {
    const elements = buildTextLayer({ links: [{ url: 'https://example.com/report', box: { x: 1, y: 2, width: 3, height: 4 } }] }).elements
    expect(elements).toEqual([{ tag: 'link', name: 'https://example.com/report', selector: '', box: { x: 1, y: 2, width: 3, height: 4 } }])
  })

  it('returns nothing for a page without text', () => {
    expect(buildTextLayer({ runs: [], links: [] })).toEqual({ elements: [], words: [] })
  })
})

describe('buildTextLayer words', () => {
  it('lists words in reading order, block by block and line by line, with their line', () => {
    const { words } = buildTextLayer({
      runs: [
        run('Right', 900, 300), run('column', 960, 300), run('Left', 100, 300), run('column', 160, 300),
        run('more', 100, 324), run('left', 150, 324)
      ]
    })
    expect(words.map((w) => [w.text, w.line])).toEqual([
      ['Left', 0], ['column', 0], ['more', 1], ['left', 1], ['Right', 2], ['column', 2]
    ])
  })

  it('keeps the box of every word', () => {
    const { words } = buildTextLayer({ runs: [run('ab', 100, 300, { width: 20 }), run('cd', 130, 300, { width: 20 })] })
    expect(words.map((w) => w.box)).toEqual([
      { x: 100, y: 300, width: 20, height: 20 },
      { x: 130, y: 300, width: 20, height: 20 }
    ])
  })
})

describe('buildTextLayer lines', () => {
  const words = (page) => buildTextLayer(page).words.map((w) => w.text)

  it('keeps a line together when a word sits a little higher or is set smaller or larger', () => {
    expect(words({ runs: [run('one', 50, 300.4), run('two', 85, 300), run('three', 120, 300.4)] })).toEqual(['one', 'two', 'three'])
    expect(words({
      runs: [run('Hello', 50, 300), { str: 'BIG', fontSize: 28, box: { x: 110, y: 294, width: 40, height: 28 }, baseline: 316 }, run('world', 160, 300)]
    })).toEqual(['Hello', 'BIG', 'world'])
  })

  it('drops a word drawn twice on top of itself, as fake bold does', () => {
    expect(words({ runs: [run('Title', 50, 300), run('Title', 50.3, 300)] })).toEqual(['Title'])
  })
})

describe('buildTextLayer reading order', () => {
  const words = (page) => buildTextLayer(page).words.map((w) => w.text)

  it('reads a column to its end before the next one', () => {
    const runs = [0, 1, 2].flatMap((i) => [run(`L${i}`, 100, 300 + i * 24), run(`R${i}`, 900, 300 + i * 24)])
    expect(words({ runs })).toEqual(['L0', 'L1', 'L2', 'R0', 'R1', 'R2'])
  })

  it('reads every paragraph of a column before the next column', () => {
    // 80px apart: every line is a paragraph of its own.
    const runs = [0, 1, 2].flatMap((i) => [run(`L${i}`, 100, 300 + i * 80), run(`R${i}`, 900, 300 + i * 80)])
    expect(words({ runs })).toEqual(['L0', 'L1', 'L2', 'R0', 'R1', 'R2'])
  })

  it('reads a full-width heading before the columns under it and a full-width footer after them', () => {
    // The test runs stand for single words, so a spanning run is one entry.
    const heading = 'Heading across both columns'
    const footer = 'Footer across both columns'
    const runs = [
      run(heading, 100, 100, { width: 1200 }),
      run('L0', 100, 300), run('R0', 900, 300), run('L1', 100, 324), run('R1', 900, 324),
      run(footer, 100, 600, { width: 1200 })
    ]
    expect(words({ runs })).toEqual([heading, 'L0', 'L1', 'R0', 'R1', footer])
  })
})
