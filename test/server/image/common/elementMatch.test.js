import { describe, it, expect } from 'vitest'
import { matchAnnotation, formatElementLine, describeMatch } from '../../../../server/image/common/elementMatch.js'

const el = (selector, x, y, width, height, extra = {}) => ({
  tag: 'div', role: '', name: '', media: '', selector, box: { x, y, width, height }, ...extra
})

const section = el('#hero', 0, 0, 1000, 600, { tag: 'section' })
const photo = el('#hero img', 100, 100, 300, 200, { tag: 'img', name: 'Team photo', media: 'team.jpg' })
const button = el('#hero a.cta', 500, 400, 120, 40, { tag: 'a', role: 'button', name: 'Start trial' })
const map = [section, photo, button]

const pin = (x, y) => ({ type: 'pin', geometry: { x, y } })
const arrow = (x1, y1, x2, y2, arrowStyle) => ({ type: 'arrow', arrowStyle, geometry: { x1, y1, x2, y2 } })

describe('matchAnnotation', () => {
  it('matches a pin to the smallest element containing it', () => {
    expect(matchAnnotation(map, pin(150, 150))).toEqual([photo])
  })

  it('falls back to the nearest element within reach when nothing contains the point', () => {
    expect(matchAnnotation([photo], pin(410, 150))).toEqual([photo])
    expect(matchAnnotation([photo], pin(480, 150))).toEqual([])
  })

  it('prefers a nearby element over a container that merely encloses the point', () => {
    const main = el('main', 0, 0, 1000, 1000, { tag: 'main' })
    const buy = el('button', 100, 100, 80, 30, { tag: 'button', name: 'Buy' })
    expect(matchAnnotation([main, buy], pin(190, 110))).toEqual([buy])
    expect(matchAnnotation([main, buy], arrow(400, 400, 185, 115))).toEqual([buy])
    expect(matchAnnotation([main, buy], pin(600, 600))).toEqual([main])
  })

  it('ranks a named landmark below a nearby link too', () => {
    const nav = el('#mainnavigation', 370, 92, 802, 57, { tag: 'nav', name: 'Main navigation' })
    const link = el('a.main-nav__link', 493, 105, 124, 16, { tag: 'a', name: 'TYPO3 Association' })
    expect(matchAnnotation([nav, link], pin(557, 131))).toEqual([link])
    expect(matchAnnotation([nav, link], pin(1100, 140))).toEqual([nav])
  })

  it('names a plain div panel for an empty spot inside it, but never over a specific element', () => {
    const main = el('#page-content', 0, 0, 1920, 4000, { tag: 'main' })
    const panel = el('div.member-banner', 1025, 1839, 590, 600)
    const logo = el('a.t3js-banner', 1245, 1967, 150, 60, { tag: 'a' })
    expect(matchAnnotation([main, panel, logo], pin(1267, 2178))).toEqual([panel])
    expect(matchAnnotation([main, panel, logo], pin(1300, 1990))).toEqual([logo])
    expect(matchAnnotation([main, panel, logo], pin(1300, 2040))).toEqual([logo])
    expect(matchAnnotation([main, panel, logo], pin(100, 100))).toEqual([main])
  })

  it('prefers the innermost of equally sized elements, which comes later in document order', () => {
    const outer = el('div.frame-inner', 1025, 1839, 590, 600)
    const inner = el('div.member-banner', 1025, 1839, 590, 600)
    const link = el('a.t3js-banner', 1245, 1967, 150, 60, { tag: 'a' })
    const logo = el('a.t3js-banner img', 1245, 1967, 150, 60, { tag: 'img', name: 'toujou' })
    expect(matchAnnotation([outer, inner], pin(1267, 2178))).toEqual([inner])
    expect(matchAnnotation([outer, inner, link, logo], pin(1300, 1990))).toEqual([logo])
    expect(matchAnnotation([link, logo], pin(1300, 2040))).toEqual([logo])
    const box = { type: 'box', geometry: { x: 1240, y: 1960, width: 160, height: 70 } }
    expect(matchAnnotation([outer, inner, link, logo], box)).toEqual([logo])
  })

  it('treats a div with a role or a name as specific', () => {
    const main = el('#page-content', 0, 0, 1000, 1000, { tag: 'main' })
    const toggle = el('div.toggle', 100, 100, 80, 30, { role: 'button' })
    expect(matchAnnotation([main, toggle], pin(190, 110))).toEqual([toggle])
  })

  it('matches a box to the element it overlaps most', () => {
    const box = { type: 'box', geometry: { x: 90, y: 90, width: 320, height: 220 } }
    expect(matchAnnotation(map, box)).toEqual([photo])
  })

  it('falls back to the smallest element containing the center of a box with no strong overlap', () => {
    const box = { type: 'box', geometry: { x: 540, y: 410, width: 20, height: 10 } }
    expect(matchAnnotation(map, box)).toEqual([button])
  })

  it('uses the bounding box of a freehand mark', () => {
    const freehand = { type: 'freehand', geometry: { points: [{ x: 95, y: 95 }, { x: 405, y: 95 }, { x: 405, y: 305 }, { x: 95, y: 305 }] } }
    expect(matchAnnotation(map, freehand)).toEqual([photo])
  })

  it('widens a thin highlighter stroke by its width before matching', () => {
    const highlighter = { type: 'highlighter', geometry: { points: [{ x: 505, y: 420 }, { x: 615, y: 420 }] } }
    expect(matchAnnotation(map, highlighter)).toEqual([button])
  })

  it('matches a head arrow only at its tip', () => {
    expect(matchAnnotation(map, arrow(150, 150, 550, 420))).toEqual([button])
    expect(matchAnnotation(map, arrow(150, 150, 550, 420, 'head'))).toEqual([button])
  })

  it('matches both ends of a dimension, double or plain line, once each', () => {
    expect(matchAnnotation(map, arrow(150, 150, 550, 420, 'dimension'))).toEqual([photo, button])
    expect(matchAnnotation(map, arrow(150, 150, 550, 420, 'double'))).toEqual([photo, button])
    expect(matchAnnotation(map, arrow(150, 150, 160, 160, 'none'))).toEqual([photo])
  })

  it('matches a selected element to the element whose box it carries', () => {
    expect(matchAnnotation(map, { type: 'element', geometry: { ...photo.box } })).toEqual([photo])
    expect(matchAnnotation(map, { type: 'element', geometry: { ...section.box } })).toEqual([section])
  })

  it('resolves a box shared by a paragraph and its panel to the paragraph, even when the panel comes later in the map', () => {
    const lead = el('p.lead', 260, 418, 1400, 60, { tag: 'p', name: 'The TYPO3 project is backed' })
    const wrapper = el('div.content-main', 260, 418, 1400, 60)
    const selected = { type: 'element', geometry: { x: 260, y: 418, width: 1400, height: 60 } }
    expect(matchAnnotation([lead, wrapper], selected)).toEqual([lead])
    expect(matchAnnotation([lead, wrapper], pin(960, 435))).toEqual([lead])
  })

  it('matches nothing for a general comment or an empty map', () => {
    expect(matchAnnotation(map, { type: 'comment', geometry: null })).toEqual([])
    expect(matchAnnotation([], pin(150, 150))).toEqual([])
    expect(matchAnnotation(null, pin(150, 150))).toEqual([])
  })
})

describe('formatElementLine', () => {
  it('describes matched elements without the line prefix, for the session file', () => {
    expect(describeMatch([button])).toBe('a[button] "Start trial" · #hero a.cta')
    expect(describeMatch([])).toBeNull()
  })

  it('renders tag, role, quoted name, media file and selector', () => {
    expect(formatElementLine([photo])).toBe('Element: img "Team photo" ("team.jpg") · #hero img')
    expect(formatElementLine([button])).toBe('Element: a[button] "Start trial" · #hero a.cta')
  })

  it('joins two elements with an arrow', () => {
    expect(formatElementLine([photo, button])).toBe(
      'Element: img "Team photo" ("team.jpg") · #hero img → a[button] "Start trial" · #hero a.cta'
    )
  })

  it('escapes quotes and removes backticks so page text cannot break out of the line', () => {
    const tricky = el('p', 0, 0, 1, 1, { tag: 'p', name: 'Say "hi" `now`' })
    expect(formatElementLine([tricky])).toBe('Element: p "Say \\"hi\\" now" · p')
  })

  it('adds the heading of an unnamed panel, quoted like a name', () => {
    const panel = el('#c588 div.frame-container', 0, 0, 1, 1, { heading: 'The "TYPO3" Project' })
    expect(formatElementLine([panel])).toBe('Element: div (heading "The \\"TYPO3\\" Project") · #c588 div.frame-container')
  })

  it('omits a role that just repeats the tag and an empty name', () => {
    expect(formatElementLine([el('nav', 0, 0, 1, 1, { tag: 'nav', role: 'nav' })])).toBe('Element: nav · nav')
  })

  it('returns null when there is nothing to report', () => {
    expect(formatElementLine([])).toBeNull()
  })
})
