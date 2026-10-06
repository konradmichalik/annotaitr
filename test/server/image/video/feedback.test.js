import { describe, it, expect } from 'vitest'
import { exportVideoFeedback, formatVideoApprovalWithNotes } from '../../../../server/image/video/feedback.js'
import { orderVideoAnnotations, planFrames } from '../../../../server/image/video/timeline.js'

const media = { label: 'demo.mov', duration: 14.2, width: 1000, height: 500 }

const box = {
  id: 'a3f00000-0000-4000-8000-000000000000', type: 'box', text: 'Button flickers',
  geometry: { x: 800, y: 50, width: 100, height: 40 }, time: 3.24
}
const spanPin = { id: 'p', type: 'pin', text: 'Spinner keeps running', geometry: { x: 500, y: 250 }, time: 5, endTime: 7.48 }
const spanComment = { id: 's', type: 'comment', geometry: null, text: 'Layout jumps', time: 8, endTime: 9 }
const general = { id: 'g', type: 'comment', geometry: null, text: 'Too slow overall' }

function render(annotations, formatter = exportVideoFeedback) {
  const ordered = orderVideoAnnotations(annotations)
  const plan = planFrames(ordered, media.duration)
  const files = {
    dir: '/tmp/out',
    overview: '/tmp/out/overview.png',
    frames: new Map(plan.frames.map((f, i) => [f.time, `/tmp/out/frame-${i + 1}.png`])),
    strips: new Map(plan.strips.map((s) => [s.number, `/tmp/out/strip-${s.number}.png`]))
  }
  return formatter({ ordered, plan, media, files })
}

describe('exportVideoFeedback', () => {
  it('opens with count, recording label, duration and size, then the output paths', () => {
    const output = render([box])
    expect(output).toMatch(/^1 annotation on the recording demo\.mov \(00:14\.200, 1000x500\)\./)
    expect(output).toContain('Frames: /tmp/out')
    expect(output).toContain('Overview: /tmp/out/overview.png')
  })

  it('anchors a point annotation to its time, position and frame', () => {
    const output = render([box])
    expect(output).toContain('### 1. [#a3f00000] at 00:03.240, Boxed area: top right')
    expect(output).toContain('Frame: /tmp/out/frame-1.png')
    expect(output).toContain('> Button flickers')
  })

  it('gives a span its start and end, its frame and a strip', () => {
    const output = render([spanPin])
    expect(output).toContain('### 1. from 00:05.000 to 00:07.480, Comment pin: center')
    expect(output).toContain('Strip: /tmp/out/strip-1.png')
  })

  it('describes a span without drawing by time only', () => {
    const output = render([spanComment])
    expect(output).toContain('### 1. from 00:08.000 to 00:09.000, Span comment\n')
    expect(output).toContain('Frame: /tmp/out/frame-1.png')
    expect(output).toContain('Strip: /tmp/out/strip-1.png')
  })

  it('numbers in time order and lists general comments last', () => {
    const output = render([general, spanComment, box])
    expect(output.indexOf('### 1. [#a3f00000]')).toBeGreaterThan(-1)
    expect(output).toContain('### 2. from 00:08.000')
    expect(output).toContain('### 3. General comment about the whole recording')
  })

  it('flags nearby annotations only within the same frame', () => {
    const near = { ...box, id: 'n', geometry: { x: 810, y: 55, width: 90, height: 30 } }
    const otherFrame = { ...near, id: 'o', time: 10 }
    const output = render([box, near, otherFrame])
    expect(output).toContain('close to annotation 2')
    expect(output).not.toContain('close to annotation 3')
  })
})

describe('formatVideoApprovalWithNotes', () => {
  it('marks the recording approved and the notes as context', () => {
    const output = render([box], formatVideoApprovalWithNotes)
    expect(output).toMatch(/^APPROVED WITH NOTES: 1 note\. The recording is approved as-is\./)
    expect(output).toContain('Frame: /tmp/out/frame-1.png')
  })
})

describe('comment quoting', () => {
  it('keeps every line of a comment inside the quote, whatever the line ending', () => {
    const output = render([{ ...box, text: 'one\rtwo\r\nthree\nfour' }])
    expect(output).toContain('> one\n> two\n> three\n> four')
  })
})
