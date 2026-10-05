import { describe, it, expect } from 'vitest'
import { matchAnnotation as clientMatch, elementLabel, serverHighlighterWidth } from '../../../client/image/src/utils/elementMatch.js'
import { matchAnnotation as serverMatch } from '../../../server/image/elementMatch.js'
import { serverStrokeWidth } from '../../../server/image/annotationStyles.js'
import { CONTAINERS } from '../../../server/image/domMap.js'

const el = (selector, x, y, width, height, extra = {}) => ({
  tag: 'div', role: '', name: '', media: '', selector, box: { x, y, width, height }, ...extra
})

const map = [
  el('#page-content', 0, 0, 1920, 4000, { tag: 'main' }),
  el('#mainnavigation', 370, 92, 802, 57, { tag: 'nav', name: 'Main navigation' }),
  el('a.main-nav__link', 493, 105, 124, 16, { tag: 'a', name: 'TYPO3 Association' }),
  el('div.frame-inner', 1025, 1839, 590, 600),
  el('div.member-banner', 1025, 1839, 590, 600),
  el('a.t3js-banner', 1245, 1967, 150, 60, { tag: 'a' }),
  el('a.t3js-banner img', 1245, 1967, 150, 60, { tag: 'img', name: 'toujou', media: 'toujou.svg' }),
  el('div.toggle', 100, 300, 80, 30, { role: 'button' })
]

const annotations = [
  { type: 'pin', geometry: { x: 557, y: 131 } },
  { type: 'pin', geometry: { x: 1267, y: 2178 } },
  { type: 'pin', geometry: { x: 1300, y: 2040 } },
  { type: 'pin', geometry: { x: 190, y: 310 } },
  { type: 'pin', geometry: { x: 5000, y: 5000 } },
  // Just inside and just outside the near-miss reach and the overlap threshold.
  { type: 'pin', geometry: { x: 557, y: 141 } },
  { type: 'pin', geometry: { x: 557, y: 151 } },
  { type: 'box', geometry: { x: 100, y: 300, width: 80, height: 80 } },
  { type: 'box', geometry: { x: 100, y: 300, width: 80, height: 150 } },
  { type: 'arrow', geometry: { x1: 100, y1: 1000, x2: 600, y2: 130 } },
  { type: 'arrow', arrowStyle: 'dimension', geometry: { x1: 500, y1: 110, x2: 1300, y2: 1990 } },
  { type: 'arrow', arrowStyle: 'none', geometry: { x1: 1300, y1: 1990, x2: 1310, y2: 1995 } },
  { type: 'box', geometry: { x: 1240, y: 1960, width: 160, height: 70 } },
  { type: 'box', geometry: { x: 1100, y: 1900, width: 20, height: 10 } },
  { type: 'freehand', geometry: { points: [{ x: 360, y: 85 }, { x: 1180, y: 85 }, { x: 1180, y: 155 }, { x: 360, y: 155 }] } },
  { type: 'highlighter', geometry: { points: [{ x: 495, y: 113 }, { x: 615, y: 113 }] } },
  { type: 'highlighter', strokeWidth: 26, geometry: { points: [{ x: 495, y: 113 }, { x: 615, y: 113 }] } },
  { type: 'freehand', geometry: { points: [] } },
  { type: 'element', geometry: { x: 1025, y: 1839, width: 590, height: 600 } },
  { type: 'element', geometry: { x: 1245, y: 1967, width: 150, height: 60 } },
  { type: 'comment', geometry: null }
]

describe('client element matching', () => {
  it('matches every annotation exactly as the server does, so the UI shows what the agent gets', () => {
    for (const annotation of annotations) {
      expect(clientMatch(map, annotation)).toEqual(serverMatch(map, annotation))
    }
  })

  it('covers both sides of the reach and overlap thresholds, so drift in either shows up', () => {
    const names = (a) => serverMatch(map, a).map((match) => match.selector)
    expect(names({ type: 'pin', geometry: { x: 557, y: 141 } })).toEqual(['a.main-nav__link'])
    expect(names({ type: 'pin', geometry: { x: 557, y: 151 } })).toEqual(['#page-content'])
    expect(names({ type: 'box', geometry: { x: 100, y: 300, width: 80, height: 80 } })).toEqual(['div.toggle'])
    expect(names({ type: 'box', geometry: { x: 100, y: 300, width: 80, height: 150 } })).toEqual(['#page-content'])
  })

  it('pads a highlighter by the same width the server draws it at', () => {
    for (const strokeWidth of [undefined, 10, 16, 26]) {
      const highlighter = { type: 'highlighter', strokeWidth, geometry: { points: [] } }
      expect(serverHighlighterWidth(highlighter)).toBe(serverStrokeWidth(highlighter))
    }
  })

  it('ranks every landmark tag the server knows last, just like the server', () => {
    for (const tag of [...CONTAINERS, 'div', 'p']) {
      const landmark = el(tag, 0, 0, 500, 500, { tag })
      const button = el('button', 100, 100, 80, 30, { tag: 'button', name: 'Buy' })
      const nearButton = { type: 'pin', geometry: { x: 190, y: 110 } }
      expect(clientMatch([landmark, button], nearButton)).toEqual(serverMatch([landmark, button], nearButton))
    }
  })

  it('matches nothing without a map', () => {
    expect(clientMatch([], annotations[0])).toEqual([])
    expect(clientMatch(null, annotations[0])).toEqual([])
  })
})

describe('elementLabel', () => {
  it('names the element by tag, role, name and media file', () => {
    expect(elementLabel(map[6])).toBe('img "toujou" (toujou.svg)')
    expect(elementLabel(map[7])).toBe('div.toggle[button]')
    expect(elementLabel(map[2])).toBe('a.main-nav__link "TYPO3 Association"')
    expect(elementLabel(map[4])).toBe('div.member-banner')
  })
})
