import { describe, it, expect } from 'vitest'
import { wordIndexAt, selectWords } from '../../../client/image/src/utils/textSelection.js'

const word = (text, x, y, line) => ({ text, line, box: { x, y, width: 40, height: 20 } })
const words = [
  word('North', 100, 100, 0), word('grew', 150, 100, 0), word('12%', 200, 100, 0),
  word('South', 100, 130, 1), word('stayed', 150, 130, 1)
]

describe('wordIndexAt', () => {
  it('finds the word under the point', () => {
    expect(wordIndexAt(words, { x: 160, y: 110 })).toBe(1)
  })

  it('takes the nearest word within reach and nothing further away', () => {
    expect(wordIndexAt(words, { x: 245, y: 110 })).toBe(2)
    expect(wordIndexAt(words, { x: 600, y: 600 })).toBe(-1)
  })
})

describe('selectWords', () => {
  it('selects every word between the two ends, with one rectangle per line', () => {
    expect(selectWords(words, 3, 1)).toEqual({
      geometry: {
        x: 100, y: 100, width: 140, height: 50,
        rects: [{ x: 150, y: 100, width: 90, height: 20 }, { x: 100, y: 130, width: 40, height: 20 }]
      },
      quote: 'grew 12% South'
    })
  })

  it('selects a single word', () => {
    expect(selectWords(words, 0, 0).quote).toBe('North')
  })

  it('selects nothing when an end is not on a word', () => {
    expect(selectWords(words, -1, 2)).toBeNull()
  })
})
