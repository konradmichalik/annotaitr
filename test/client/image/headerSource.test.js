import { describe, it, expect } from 'vitest'
import { sourceKind, targetFacts } from '../../../client/image/src/utils/headerSource.js'

describe('sourceKind', () => {
  it('tells the target kinds apart from the meta the server sends', () => {
    expect(sourceKind({ kind: 'document', targetLabel: 'plan.pdf' })).toBe('pdf')
    expect(sourceKind({ kind: 'video', targetLabel: 'demo.mp4' })).toBe('video')
    expect(sourceKind({ targetLabel: 'https://example.com', capture: { viewport: {} } })).toBe('url')
    expect(sourceKind({ targetLabel: 'clipboard image' })).toBe('clipboard')
    expect(sourceKind({ targetLabel: 'shot.png' })).toBe('image')
  })

  it('has no kind before the meta arrived', () => {
    expect(sourceKind(null)).toBeNull()
  })
})

describe('targetFacts', () => {
  it('counts the pages of a PDF', () => {
    expect(targetFacts({ kind: 'pdf', pageCount: 11 })).toBe('11 pages')
    expect(targetFacts({ kind: 'pdf', pageCount: 1 })).toBe('1 page')
  })

  it('gives the size of a still image', () => {
    expect(targetFacts({ kind: 'image', width: 1280, height: 800 })).toBe('1280 × 800')
  })

  it('gives the duration and size of a recording', () => {
    expect(targetFacts({ kind: 'video', width: 640, height: 360, duration: 83.5 })).toBe('01:23.500 · 640 × 360')
  })

  it('leaves out what is not known yet', () => {
    expect(targetFacts({ kind: 'video' })).toBe('')
    expect(targetFacts({ kind: 'image' })).toBe('')
  })
})
