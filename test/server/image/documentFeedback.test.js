import { describe, it, expect } from 'vitest'
import { exportDocumentFeedback, formatDocumentApprovalWithNotes } from '../../../server/image/documentFeedback.js'
import { orderDocumentAnnotations, planDocumentPages } from '../../../server/image/pages.js'

const document = {
  label: 'deck.pdf',
  pageCount: 12,
  pages: Array.from({ length: 12 }, (_, i) => ({ number: i + 1, width: 2000, height: 1125 }))
}

const box = {
  id: 'a3f19c2e-0000-4000-8000-000000000000', type: 'box', text: 'Use the same colours as on page 2',
  geometry: { x: 1600, y: 100, width: 300, height: 120 }, page: 3
}
const pageComment = { id: '7b210e44-0000-4000-8000-000000000000', type: 'comment', geometry: null, text: 'Too much text\nsplit it', page: 3 }
const pin = { id: 'p', type: 'pin', text: 'Typo', geometry: { x: 1000, y: 600 }, page: 7 }
const general = { id: 'c01d9e55-0000-4000-8000-000000000000', type: 'comment', geometry: null, text: 'Consistent title capitalisation' }

function render(annotations, { formatter = exportDocumentFeedback, source = null, withFiles = true, doc = document } = {}) {
  const ordered = orderDocumentAnnotations(annotations)
  const plan = planDocumentPages(ordered)
  const files = withFiles
    ? { dir: '/tmp/out', overview: plan.length > 0 ? '/tmp/out/overview.png' : null, pages: new Map(plan.map((p) => [p.page, `/tmp/out/page-${p.page}.png`])) }
    : null
  return formatter({ ordered, plan, document: doc, source, files })
}

describe('exportDocumentFeedback', () => {
  it('opens with counts, the source and the overview', () => {
    const output = render([general, pin, box, pageComment])
    expect(output).toMatch(/^4 annotations on 2 of 12 pages\.\n\nSource: deck\.pdf\nOverview: \/tmp\/out\/overview\.png\n/)
  })

  it('names the source a PDF was rendered from and warns when it was newer', () => {
    expect(render([box], { source: { label: 'deck.pptx', newer: false } })).toContain('Source: deck.pptx (rendered as deck.pdf)\n')
    expect(render([box], { source: { label: 'deck.pptx', newer: true } }))
      .toMatch(/Source: deck\.pptx \(rendered as deck\.pdf\)\nWarning: deck\.pptx was newer than deck\.pdf/)
  })

  it('groups annotations under their page with the annotated page image, numbered across the document', () => {
    const output = render([general, pin, box, pageComment])
    expect(output).toContain('## Page 3\nAnnotated page: /tmp/out/page-3.png\n\n### 1. [#a3f19c2e] Boxed area: top right (')
    expect(output).toContain('> Use the same colours as on page 2\n')
    expect(output).toContain('### 2. [#7b210e44] Page comment\n> Too much text\n> split it\n')
    expect(output).toContain('## Page 7\nAnnotated page: /tmp/out/page-7.png\n\n### 3. Comment pin:')
    expect(output.indexOf('## Page 3')).toBeLessThan(output.indexOf('## Page 7'))
  })

  it('lists comments about the whole document last', () => {
    const output = render([general, box])
    expect(output).toMatch(/## General\n### 2\. \[#c01d9e55\] General comment about the whole document\n> Consistent title capitalisation\n$/)
  })

  it('leaves out every path when the text is copied from the annotator', () => {
    const output = render([general, box], { withFiles: false })
    expect(output).not.toContain('/tmp')
    expect(output).not.toContain('Overview:')
    expect(output).not.toContain('Annotated page:')
  })

  it('says how many pages were reviewed when --pages picked a part of the document', () => {
    const doc = { ...document, pages: document.pages.slice(8, 11) }
    expect(render([{ ...box, page: 9 }], { doc })).toMatch(/^1 annotation on 1 of 3 reviewed pages \(the document has 12\)\./)
  })

  it('keeps a bare carriage return from ending the quote', () => {
    expect(render([{ ...box, text: 'one\r## two' }])).toContain('> one\n> ## two')
  })
})

describe('formatDocumentApprovalWithNotes', () => {
  it('marks the notes as context, not change requests', () => {
    const output = render([box], { formatter: formatDocumentApprovalWithNotes })
    expect(output).toMatch(/^APPROVED WITH NOTES: 1 note\. The document is approved as-is\./)
    expect(output).toContain('## Page 3')
  })
})
