import { describe, it, expect } from 'vitest'
import {
  parsePageRanges, selectPages, orderDocumentAnnotations, validateDocumentAnnotations, planDocumentPages, MAX_PAGES
} from '../../../../server/image/document/pages.js'

const box = (id, page) => ({ id, type: 'box', geometry: { x: 1, y: 1, width: 5, height: 5 }, page })
const comment = (id, page = null) => ({ id, type: 'comment', geometry: null, text: 'c', page })

describe('parsePageRanges', () => {
  it('parses single pages, closed and open ranges', () => {
    expect(parsePageRanges('1-5,8,12-')).toEqual({ ranges: [{ from: 1, to: 5 }, { from: 8, to: 8 }, { from: 12, to: null }] })
  })

  it('tolerates spaces around items', () => {
    expect(parsePageRanges(' 2 , 4-6 ')).toEqual({ ranges: [{ from: 2, to: 2 }, { from: 4, to: 6 }] })
  })

  it.each([[''], ['0'], ['a'], ['3-1'], ['1--2'], ['-4'], ['1,,2'], ['1.5']])('rejects %j', (spec) => {
    expect(parsePageRanges(spec).error).toMatch(/--pages/)
  })
})

describe('selectPages', () => {
  it('expands ranges into sorted, unique page numbers', () => {
    expect(selectPages([{ from: 4, to: 6 }, { from: 2, to: 2 }, { from: 5, to: 5 }], 10)).toEqual({ pages: [2, 4, 5, 6] })
  })

  it('runs an open range to the last page', () => {
    expect(selectPages([{ from: 8, to: null }], 10)).toEqual({ pages: [8, 9, 10] })
  })

  it('selects every page without ranges', () => {
    expect(selectPages(null, 3)).toEqual({ pages: [1, 2, 3] })
  })

  it('rejects a page beyond the document', () => {
    expect(selectPages([{ from: 3, to: 12 }], 10).error).toMatch(/page 12.*10 pages/)
    expect(selectPages([{ from: 11, to: null }], 10).error).toMatch(/page 11.*10 pages/)
  })

  it('rejects more pages than a session can hold and points at --pages', () => {
    expect(selectPages(null, MAX_PAGES + 1).error).toMatch(/--pages/)
    expect(selectPages([{ from: 1, to: MAX_PAGES }], MAX_PAGES + 50)).toEqual({ pages: expect.any(Array) })
  })
})

describe('orderDocumentAnnotations', () => {
  it('orders by page, keeps array order within a page and puts document comments last', () => {
    const items = [comment('g'), box('a', 3), box('b', 1), comment('c', 3), box('d', 1)]
    expect(orderDocumentAnnotations(items).map((a) => a.id)).toEqual(['b', 'd', 'a', 'c', 'g'])
  })
})

describe('validateDocumentAnnotations', () => {
  const pages = new Set([1, 2, 5])

  it('accepts drawn marks and page comments on session pages and document comments without one', () => {
    expect(validateDocumentAnnotations([box('a', 5), comment('b', 2), comment('c')], pages)).toBeNull()
  })

  it('rejects entries that are not objects or carry non-string text', () => {
    expect(validateDocumentAnnotations([null], pages)).toMatch(/must be an object/)
    expect(validateDocumentAnnotations([{ ...box('a', 1), text: 42 }], pages)).toMatch(/text must be a string/)
  })

  it('accepts a text selection with its lines and quote, and rejects one without', () => {
    const rects = [{ x: 1, y: 2, width: 30, height: 10 }]
    const selection = { id: 't', type: 'text', page: 1, quote: 'North grew', geometry: { x: 1, y: 2, width: 30, height: 10, rects } }
    expect(validateDocumentAnnotations([selection], pages)).toBeNull()
    expect(validateDocumentAnnotations([{ ...selection, quote: '' }], pages)).toMatch(/selected text/)
    expect(validateDocumentAnnotations([{ ...selection, geometry: { ...selection.geometry, rects: [] } }], pages)).toMatch(/line rectangles/)
    expect(validateDocumentAnnotations([{ ...selection, geometry: { ...selection.geometry, rects: [{ x: 'a' }] } }], pages)).toMatch(/line rectangles/)
  })

  it('requires a page on a drawn mark', () => {
    expect(validateDocumentAnnotations([box('a', null)], pages)).toMatch(/needs a page/)
  })

  it('rejects a page outside the session', () => {
    expect(validateDocumentAnnotations([box('a', 3)], pages)).toMatch(/not part of this review/)
    expect(validateDocumentAnnotations([comment('a', 1.5)], pages)).toMatch(/not part of this review/)
  })
})

describe('planDocumentPages', () => {
  it('groups numbered annotations by page in document order and leaves document comments out', () => {
    const ordered = orderDocumentAnnotations([box('a', 3), comment('g'), box('b', 1), comment('c', 3)])
    expect(planDocumentPages(ordered)).toEqual([
      { page: 1, entries: [{ annotation: ordered[0], number: 1 }] },
      { page: 3, entries: [{ annotation: ordered[1], number: 2 }, { annotation: ordered[2], number: 3 }] }
    ])
  })
})
