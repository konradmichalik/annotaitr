import { describe, it, expect } from 'vitest'
import { mediaName, normalizeDomMap } from '../../../server/image/domMap.js'

const raw = (overrides = {}) => ({
  x: 10, y: 20, width: 100, height: 50,
  tag: 'img', role: '', text: '', alt: '', ariaLabel: '', title: '', src: '',
  self: { tag: 'img', id: '', cls: '' },
  ancestors: [],
  ...overrides
})

describe('mediaName', () => {
  it('keeps the last path segment and drops the query string and hash', () => {
    expect(mediaName('https://example.com/img/team.jpg?w=800&h=600#x')).toBe('team.jpg')
  })

  it('shortens a data: URL to its media type', () => {
    expect(mediaName('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png')
  })

  it('takes the first candidate of a srcset', () => {
    expect(mediaName('/a/hero-small.webp 480w, /a/hero-large.webp 1200w')).toBe('hero-small.webp')
  })

  it('decodes an escaped file name', () => {
    expect(mediaName('https://example.com/Team%20Photo.png')).toBe('Team Photo.png')
  })

  it('returns an empty string for a missing or path-less source', () => {
    expect(mediaName('')).toBe('')
    expect(mediaName('https://example.com/')).toBe('')
  })
})

describe('normalizeDomMap', () => {
  it('returns an empty map for anything that is not an array', () => {
    expect(normalizeDomMap(null)).toEqual([])
    expect(normalizeDomMap({ length: 3 })).toEqual([])
  })

  it('names an element by aria-label, then alt, then title, then text', () => {
    const [byAria, byAlt, byTitle, byText] = normalizeDomMap([
      raw({ ariaLabel: 'Open menu', alt: 'x', title: 'y', text: 'z' }),
      raw({ alt: 'Team photo', title: 'y', text: 'z' }),
      raw({ title: 'Tooltip', text: 'z' }),
      raw({ tag: 'button', text: 'Start trial', self: { tag: 'button', id: '', cls: '' } })
    ])
    expect([byAria.name, byAlt.name, byTitle.name, byText.name]).toEqual(['Open menu', 'Team photo', 'Tooltip', 'Start trial'])
  })

  it('does not name a landmark container by its whole text content', () => {
    const [section] = normalizeDomMap([raw({ tag: 'section', text: 'Lots of nested text', self: { tag: 'section', id: 'pricing', cls: '' } })])
    expect(section.name).toBe('')
  })

  it('keeps a plain div with a readable class or id as an unnamed fallback, ignoring its text', () => {
    const [card] = normalizeDomMap([raw({ tag: 'div', text: 'Everything inside the card', self: { tag: 'div', id: '', cls: 'member-banner' } })])
    expect(card).toMatchObject({ tag: 'div', name: '', selector: 'div.member-banner' })
  })

  it('names an unnamed panel or landmark after its first heading, and nothing else', () => {
    const [panel, landmark, labelled, paragraph] = normalizeDomMap([
      raw({ tag: 'div', heading: '  The TYPO3 Project\nand its Governance ', self: { tag: 'div', id: '', cls: 'frame' } }),
      raw({ tag: 'section', heading: 'Pricing', self: { tag: 'section', id: 'pricing', cls: '' } }),
      raw({ tag: 'nav', ariaLabel: 'Main navigation', heading: 'Menu', self: { tag: 'nav', id: '', cls: 'menu' } }),
      raw({ tag: 'p', text: 'Body copy', heading: 'Stray', self: { tag: 'p', id: '', cls: '' } })
    ])
    expect(panel.heading).toBe('The TYPO3 Project and its Governance')
    expect(landmark.heading).toBe('Pricing')
    expect(labelled.heading).toBe('')
    expect(paragraph.heading).toBe('')
  })

  it('drops a plain div with neither a readable class nor an id', () => {
    expect(normalizeDomMap([raw({ tag: 'div', self: { tag: 'div', id: '', cls: '' } })])).toEqual([])
    expect(normalizeDomMap([raw({ tag: 'div', self: { tag: 'div', id: '', cls: 'css-1x2y3z4w5v6u7t8s9r0q1p2o3n4m5' } })])).toEqual([])
  })

  it('drops an element with no name that is neither interactive, media, nor identified', () => {
    const map = normalizeDomMap([raw({ tag: 'p', text: '   ', self: { tag: 'p', id: '', cls: '' } })])
    expect(map).toEqual([])
  })

  it('collapses whitespace, strips control characters and caps long text', () => {
    const [el] = normalizeDomMap([raw({ tag: 'p', text: `Hello\n\n  world\u0007 ${'x'.repeat(200)}`, self: { tag: 'p', id: '', cls: '' } })])
    expect(el.name.startsWith('Hello world x')).toBe(true)
    expect(el.name.length).toBeLessThanOrEqual(80)
    expect(el.name.endsWith('…')).toBe(true)
  })

  it('strips bidi overrides and zero-width characters from page text', () => {
    const [el] = normalizeDomMap([raw({ tag: 'p', text: 'Pay\u202eyrrah\u200b now', self: { tag: 'p', id: '', cls: '' } })])
    expect(el.name).toBe('Pay yrrah now')
  })

  it('drops an unnamed element whose role is not a single plain token', () => {
    expect(normalizeDomMap([raw({ tag: 'div', role: 'button menu', self: { tag: 'div', id: '', cls: '' } })])).toEqual([])
  })

  it('builds a short selector from the ancestor chain, starting at the nearest id', () => {
    const [el] = normalizeDomMap([raw({
      self: { tag: 'a', id: '', cls: 'cta' },
      tag: 'a',
      ancestors: [{ tag: 'div', id: '', cls: 'card' }, { tag: 'section', id: 'pricing', cls: 'x' }, { tag: 'main', id: '', cls: '' }]
    })])
    expect(el.selector).toBe('#pricing div.card a.cta')
  })

  it('uses only the id when the element has one of its own', () => {
    const [el] = normalizeDomMap([raw({
      tag: 'nav', ariaLabel: 'Main navigation',
      self: { tag: 'nav', id: 'mainnavigation', cls: '' },
      ancestors: [{ tag: 'div', id: '', cls: 'container' }, { tag: 'header', id: '', cls: 'page-header' }]
    })])
    expect(el.selector).toBe('#mainnavigation')
  })

  it('ignores ids and classes that are not plain identifiers', () => {
    const [el] = normalizeDomMap([raw({
      self: { tag: 'img', id: 'a b"c', cls: 'w-[50%]' },
      ancestors: [{ tag: 'main', id: '', cls: '' }]
    })])
    expect(el.selector).toBe('main img')
  })

  it('leaves out generated-looking ids and classes longer than 30 characters', () => {
    const [el] = normalizeDomMap([raw({
      self: { tag: 'li', id: '', cls: 'MarketingNavigation-module__item__x1Y2z' },
      tag: 'li',
      text: 'Pricing',
      ancestors: [{ tag: 'ul', id: '', cls: 'menu' }]
    })])
    expect(el.selector).toBe('ul.menu li')
  })

  it('keeps the media name and the role, and passes the box through', () => {
    const [el] = normalizeDomMap([raw({ role: 'button', src: 'https://x.test/team.jpg?v=2', alt: 'Team' })])
    expect(el).toMatchObject({ tag: 'img', role: 'button', name: 'Team', media: 'team.jpg', box: { x: 10, y: 20, width: 100, height: 50 } })
  })

  it('skips entries with a non-finite or empty box', () => {
    const map = normalizeDomMap([raw({ width: 0 }), raw({ x: Number.NaN }), raw({ x: 'a' })])
    expect(map).toEqual([])
  })

  it('caps the number of elements', () => {
    const map = normalizeDomMap(Array.from({ length: 2500 }, () => raw()))
    expect(map).toHaveLength(2000)
  })
})
