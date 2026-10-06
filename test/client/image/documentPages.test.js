import { describe, it, expect } from 'vitest'
import {
  orderDocumentAnnotations, nextNumberOnPage, pageAnnotationCounts, stepPage, pageLabel
} from '../../../client/image/src/utils/documentPages.js'

const box = (id, page) => ({ id, type: 'box', page })
const comment = (id, page) => ({ id, type: 'comment', ...(page ? { page } : {}) })

describe('orderDocumentAnnotations', () => {
  it('matches the server order: by page, then as made, document comments last', () => {
    const ordered = orderDocumentAnnotations([comment('g'), box('a', 3), box('b', 1), comment('c', 3)])
    expect(ordered.map((a) => a.id)).toEqual(['b', 'a', 'c', 'g'])
  })
})

describe('nextNumberOnPage', () => {
  it('numbers a new mark after everything on this and earlier pages', () => {
    const ordered = orderDocumentAnnotations([box('a', 1), box('b', 3), box('c', 5), comment('g')])
    expect(nextNumberOnPage(ordered, 3)).toBe(3)
    expect(nextNumberOnPage(ordered, 1)).toBe(2)
    expect(nextNumberOnPage(ordered, 9)).toBe(4)
  })
})

describe('pageAnnotationCounts', () => {
  it('counts drawn marks and page comments per page', () => {
    const counts = pageAnnotationCounts([box('a', 1), comment('b', 1), box('c', 4), comment('g')])
    expect([...counts]).toEqual([[1, 2], [4, 1]])
  })
})

describe('stepPage', () => {
  const pages = [{ number: 2 }, { number: 5 }, { number: 9 }]

  it('moves to the neighbouring reviewed page and stops at the ends', () => {
    expect(stepPage(pages, 5, 1)).toBe(9)
    expect(stepPage(pages, 5, -1)).toBe(2)
    expect(stepPage(pages, 9, 1)).toBe(9)
    expect(stepPage(pages, 2, -1)).toBe(2)
  })

  it('jumps to the first or last page', () => {
    expect(stepPage(pages, 5, -Infinity)).toBe(2)
    expect(stepPage(pages, 5, Infinity)).toBe(9)
  })
})

describe('pageLabel', () => {
  it('names the page, or the whole document for a general comment', () => {
    expect(pageLabel(box('a', 7))).toBe('Page 7')
    expect(pageLabel(comment('g'))).toBe('Whole document')
  })
})
