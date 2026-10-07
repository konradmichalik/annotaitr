import { describe, it, expect } from 'vitest'
import { anchorThreads } from '../../../../server/image/common/anchorThreads.js'

const thread = (annotation, extra = {}) => ({ handle: 'a3f19c2e', number: 1, annotation, element: null, replies: [], ...extra })
const previous = (threads, extra = {}) => ({ round: 1, fingerprint: 'sha256:a', threads, ...extra })
const box = (x, y, extra = {}) => ({ type: 'box', geometry: { x, y, width: 10, height: 10 }, text: 'Fix', ...extra })
const anchors = (prev, current) => anchorThreads(prev, current).map(({ anchor, reason }) => ({ anchor, reason }))

const still = { kind: 'file', fingerprint: 'sha256:a', width: 100, height: 100 }

describe('anchorThreads', () => {
  it('returns nothing without a previous round', () => {
    expect(anchorThreads(null, still)).toEqual([])
  })

  it('keeps the thread data and adds the anchor', () => {
    const t = thread(box(1, 1), { replies: [{ status: 'applied' }] })
    expect(anchorThreads(previous([t]), still)).toEqual([{ ...t, anchor: 'exact', reason: null }])
  })

  it('anchors exactly when the target is unchanged', () => {
    expect(anchors(previous([thread(box(1, 1))]), still)).toEqual([{ anchor: 'exact', reason: null }])
  })

  it('shows a ghost at the old position when the target changed', () => {
    expect(anchors(previous([thread(box(1, 1))]), { ...still, fingerprint: 'sha256:b' }))
      .toEqual([{ anchor: 'ghost', reason: 'The target changed since round 1, the mark shows where it was then' }])
  })

  it('never anchors a URL capture exactly, it is captured again on every run', () => {
    expect(anchors(previous([thread(box(1, 1))], { fingerprint: null }), { kind: 'url', fingerprint: null, width: 100, height: 100 }))
      .toEqual([{ anchor: 'ghost', reason: 'The page was captured again since round 1, the mark shows where it was then' }])
  })

  it('treats a round written without a fingerprint as changed', () => {
    const old = previous([thread(box(1, 1))])
    delete old.fingerprint
    expect(anchors(old, still)[0].anchor).toBe('ghost')
  })

  it('orphans a mark that lies entirely outside the current image', () => {
    expect(anchors(previous([thread(box(150, 10))]), { ...still, fingerprint: 'sha256:b' }))
      .toEqual([{ anchor: 'orphan', reason: 'The mark lies outside the current image' }])
  })

  it('keeps a mark that still overlaps the image as a ghost', () => {
    expect(anchors(previous([thread(box(95, 95))]), { ...still, fingerprint: 'sha256:b' })[0].anchor).toBe('ghost')
  })

  it('bounds pins, arrows and freehand marks by their points', () => {
    const marks = [
      { type: 'pin', geometry: { x: 120, y: 5 } },
      { type: 'arrow', geometry: { x1: 110, y1: 0, x2: 130, y2: 5 } },
      { type: 'freehand', geometry: { points: [{ x: 101, y: 1 }, { x: 140, y: 2 }] } }
    ]
    expect(anchors(previous(marks.map((m) => thread(m))), { ...still, fingerprint: 'sha256:b' }).map((a) => a.anchor))
      .toEqual(['orphan', 'orphan', 'orphan'])
  })

  it('always anchors a general comment exactly', () => {
    expect(anchors(previous([thread({ type: 'comment', geometry: null, text: 'Overall' })]), { ...still, fingerprint: 'sha256:b' })[0].anchor)
      .toBe('exact')
  })

  it('orphans a mark whose geometry cannot be read instead of failing', () => {
    expect(anchors(previous([thread({ type: 'freehand', geometry: {} })]), { ...still, fingerprint: 'sha256:b' }))
      .toEqual([{ anchor: 'orphan', reason: 'The mark could not be read from the last round' }])
  })

  describe('documents', () => {
    const doc = { kind: 'document', fingerprint: 'sha256:b', pages: [1, 2] }

    it('orphans a mark on a page that is not part of this review', () => {
      expect(anchors(previous([thread(box(1, 1, { page: 3 }))]), doc))
        .toEqual([{ anchor: 'orphan', reason: 'Page 3 is not part of this review' }])
    })

    it('ghosts a mark on a page that is still there, without checking pixel bounds', () => {
      expect(anchors(previous([thread(box(5000, 5000, { page: 2 }))]), doc)[0].anchor).toBe('ghost')
    })

    it('anchors exactly when the PDF is unchanged', () => {
      expect(anchors(previous([thread(box(1, 1, { page: 1 }))], { fingerprint: 'sha256:b' }), doc)[0].anchor).toBe('exact')
    })
  })

  describe('videos', () => {
    const video = { kind: 'video', fingerprint: 'sha256:b', duration: 10 }

    it('orphans a mark past the end of the recording', () => {
      expect(anchors(previous([thread(box(1, 1, { time: 12 }))]), video))
        .toEqual([{ anchor: 'orphan', reason: 'The mark is past the end of the recording' }])
    })

    it('ghosts by time alone while the duration is unknown', () => {
      const { duration: _unknown, ...withoutDuration } = video
      expect(anchors(previous([thread(box(1, 1, { time: 12 }))]), withoutDuration)[0].anchor).toBe('ghost')
    })
  })

  it('orphans a document mark whose geometry cannot be read', () => {
    const current = { kind: 'document', fingerprint: 'sha256:a', pages: [1, 2] }
    expect(anchors(previous([thread({ type: 'box', page: 1, geometry: {} })]), current))
      .toEqual([{ anchor: 'orphan', reason: 'The mark could not be read from the last round' }])
  })

  it('orphans a video mark whose geometry cannot be read', () => {
    const current = { kind: 'video', fingerprint: 'sha256:a', duration: 60 }
    expect(anchors(previous([thread({ type: 'box', time: 5, geometry: {} })]), current))
      .toEqual([{ anchor: 'orphan', reason: 'The mark could not be read from the last round' }])
  })
})
