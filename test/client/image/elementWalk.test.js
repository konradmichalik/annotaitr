import { describe, it, expect } from 'vitest'
import { stepElement, parentOf, elementCaption } from '../../../client/image/src/utils/elementWalk.js'

const el = (selector, x, y, width, height, tag = 'div') => ({ selector, tag, box: { x, y, width, height } })
const page = el('main', 0, 0, 1000, 800, 'main')
const hero = el('section.hero', 0, 0, 1000, 300, 'section')
const lede = el('section.hero p.lede', 100, 100, 400, 22, 'p')
const card = el('div.card', 100, 400, 300, 200)
const map = [page, hero, lede, card]

describe('stepElement', () => {
  it('walks the map in document order and stops at either end', () => {
    expect(stepElement(map, null, 1)).toBe(page)
    expect(stepElement(map, hero, 1)).toBe(lede)
    expect(stepElement(map, lede, -1)).toBe(hero)
    expect(stepElement(map, card, 1)).toBeNull()
    expect(stepElement(map, page, -1)).toBeNull()
    expect(stepElement([], null, 1)).toBeNull()
  })
})

describe('parentOf', () => {
  it('is the smallest other element whose box holds this one', () => {
    expect(parentOf(map, lede)).toBe(hero)
    expect(parentOf(map, hero)).toBe(page)
    expect(parentOf(map, card)).toBe(page)
  })

  it('is null for the outermost element', () => {
    expect(parentOf(map, page)).toBeNull()
  })

  it('skips an element with the very same box, which is no step up', () => {
    const twin = el('div.wrap', 100, 100, 400, 22)
    expect(parentOf([page, hero, twin, lede], lede)).toBe(hero)
  })
})

describe('elementCaption', () => {
  it('names the selector and the rounded size', () => {
    expect(elementCaption({ ...lede, box: { x: 0, y: 0, width: 399.6, height: 22.2 } })).toBe('section.hero p.lede 400×22')
  })
})
