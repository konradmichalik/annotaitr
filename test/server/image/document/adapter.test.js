import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { loadImage } from '@napi-rs/canvas'
import { buildDocumentServer } from '../../../../server/image/document/adapter.js'
import { openPdfDocument, createPageCache } from '../../../../server/image/document/pdfDocument.js'
import { makePdf } from '../../../helpers/pdfFixtures.js'
import { hashFile } from '../../../../server/image/common/fingerprint.js'
import { createReplyStore } from '../../../../server/core/session/replyStore.js'

const box = (id, page, extra = {}) => ({
  id, type: 'box', geometry: { x: 100, y: 100, width: 300, height: 200 }, text: `note ${id}`, color: '#bf616a', page, ...extra
})

describe('openPdfDocument', () => {
  let dir, pdfPath

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-doc-'))
    pdfPath = join(dir, 'deck.pdf')
    await writeFile(pdfPath, await makePdf([{ size: 'slide' }, { size: 'portrait' }, { size: 'landscape' }]))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('sizes every page in the pixels of its rendered image', async () => {
    const document = await openPdfDocument(pdfPath)
    try {
      expect(document.pageCount).toBe(3)
      expect(document.pages).toEqual([
        { number: 1, width: 2000, height: 1125 },
        { number: 2, width: 1413, height: 2000 },
        { number: 3, width: 2000, height: 1413 }
      ])
    } finally {
      await document.renderer.close()
    }
  })

  it('keeps only the pages --pages selects, with their own numbers', async () => {
    const document = await openPdfDocument(pdfPath, { pageRanges: [{ from: 2, to: null }] })
    try {
      expect(document.pages.map((p) => p.number)).toEqual([2, 3])
    } finally {
      await document.renderer.close()
    }
  })

  it('hashes the PDF content, so a changed PDF gets a new hash', async () => {
    const otherPath = join(dir, 'other.pdf')
    await writeFile(otherPath, await makePdf([{ size: 'slide', title: 'Changed' }]))
    const [a, b, c] = await Promise.all([openPdfDocument(pdfPath), openPdfDocument(pdfPath), openPdfDocument(otherPath)])
    try {
      expect(a.hash).toMatch(/^[0-9a-f]{16}$/)
      expect(b.hash).toBe(a.hash)
      expect(c.hash).not.toBe(a.hash)
    } finally {
      await Promise.all([a, b, c].map((d) => d.renderer.close()))
    }
  })

  it('fingerprints the bytes it renders and derives the page hash from the same digest', async () => {
    const document = await openPdfDocument(pdfPath)
    try {
      expect(document.fingerprint).toBe(await hashFile(pdfPath))
      expect(document.hash).toBe(document.fingerprint.slice('sha256:'.length, 'sha256:'.length + 16))
    } finally {
      await document.renderer.close()
    }
  })

  it('rejects a selection beyond the document', async () => {
    await expect(openPdfDocument(pdfPath, { pageRanges: [{ from: 5, to: 5 }] })).rejects.toThrow(/page 5.*3 pages/)
  })
})

describe('createPageCache', () => {
  it('shares a render in flight, keeps the most recent pages and retries a failed one', async () => {
    const calls = []
    let fail = true
    const cache = createPageCache(async (page) => {
      calls.push(page)
      if (page === 9 && fail) { fail = false; throw new Error('boom') }
      return { buffer: Buffer.from(String(page)) }
    }, 2, 0)
    await Promise.all([cache.get(1), cache.get(1)])
    await cache.get(2)
    await cache.get(3)
    await cache.get(1)
    expect(calls).toEqual([1, 2, 3, 1])
    await expect(cache.get(9)).rejects.toThrow('boom')
    await new Promise((r) => setTimeout(r, 0))
    expect((await cache.get(9)).toString()).toBe('9')
  })
})

describe('createPageCache failures', () => {
  it('answers a failed page from the cache for a moment instead of rendering it again', async () => {
    let calls = 0
    const cache = createPageCache(async () => { calls += 1; throw new Error('slow page') }, 2, 60_000)
    await expect(cache.get(1)).rejects.toThrow('slow page')
    await expect(cache.get(1)).rejects.toThrow('slow page')
    expect(calls).toBe(1)
  })

  it('lets a late failure of an evicted render leave the newer entry alone', async () => {
    let rejectFirst
    let calls = 0
    const cache = createPageCache((page) => {
      calls += 1
      if (page === 1 && calls === 1) { return new Promise((_resolve, reject) => { rejectFirst = reject }) }
      return Promise.resolve({ buffer: Buffer.from(String(page)) })
    }, 1, 0)
    const first = cache.get(1)
    await cache.get(2)
    await cache.get(1)
    rejectFirst(new Error('late'))
    await expect(first).rejects.toThrow('late')
    await new Promise((r) => setTimeout(r, 5))
    await cache.get(1)
    expect(calls).toBe(3)
  })

  it('forgets an abandoned render at once', async () => {
    let calls = 0
    const abort = Object.assign(new Error('gone'), { name: 'AbortError' })
    const cache = createPageCache(async () => {
      calls += 1
      if (calls === 1) { throw abort }
      return { buffer: Buffer.from('ok') }
    }, 2, 60_000)
    await expect(cache.get(1)).rejects.toBe(abort)
    await new Promise((r) => setTimeout(r, 0))
    expect((await cache.get(1)).toString()).toBe('ok')
  })
})

describe('document annotator server', () => {
  let dir, pdfPath, server

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-doc-server-'))
    pdfPath = join(dir, 'deck.pdf')
    await writeFile(pdfPath, await makePdf([
      { size: 'slide', title: 'One' }, { size: 'portrait', title: 'Two' }, { size: 'slide', title: 'Three' }
    ]))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  afterEach(() => {
    server?.stop()
    server = null
  })

  async function start({ source = null, pageRanges = null, session = null } = {}) {
    const document = await openPdfDocument(pdfPath, { pageRanges })
    let resolveOutput
    const decided = new Promise((resolve) => { resolveOutput = resolve })
    server = await buildDocumentServer({ document, source, origin: 'cli', targetLabel: 'deck.pdf', session })
    server.waitForDecision().then(resolveOutput)
    return { decided }
  }

  const post = (path, body) => fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  it('serves document metadata', async () => {
    await start({ source: { label: 'deck.pptx', newer: true } })
    const body = await (await fetch(`${server.url}/api/meta`)).json()
    expect(body.data).toEqual({
      kind: 'document', origin: 'cli', targetLabel: 'deck.pdf', voiceNotes: false, pageCount: 3,
      pages: [{ number: 1, width: 2000, height: 1125 }, { number: 2, width: 1413, height: 2000 }, { number: 3, width: 2000, height: 1125 }],
      source: 'deck.pptx', sourceIsNewer: true, documentHash: expect.stringMatching(/^[0-9a-f]{16}$/)
    })
  })

  it('serves a page and its thumbnail as PNG, and nothing outside the review', async () => {
    await start({ pageRanges: [{ from: 1, to: 2 }] })
    const page = await fetch(`${server.url}/api/pages/2/image`)
    expect(page.headers.get('content-type')).toMatch(/image\/png/)
    const image = await loadImage(Buffer.from(await page.arrayBuffer()))
    expect([image.width, image.height]).toEqual([1413, 2000])

    const thumb = await loadImage(Buffer.from(await (await fetch(`${server.url}/api/pages/1/thumb`)).arrayBuffer()))
    expect([thumb.width, thumb.height]).toEqual([240, 135])

    expect((await fetch(`${server.url}/api/pages/3/image`)).status).toBe(404)
    expect((await fetch(`${server.url}/api/pages/abc/thumb`)).status).toBe(404)
  })

  it('rejects annotation entries that would only fail at decision time', async () => {
    await start()
    expect((await post('/api/annotations', { annotations: [null] })).status).toBe(400)
    expect((await post('/api/annotations', { annotations: [box('a', 1, { text: 42 })] })).status).toBe(400)
  })

  it('rejects annotations without a page or on a page outside the review', async () => {
    await start({ pageRanges: [{ from: 1, to: 2 }] })
    expect((await post('/api/annotations', { annotations: [box('a', null)] })).status).toBe(400)
    expect((await post('/api/annotations', { annotations: [box('a', 3)] })).status).toBe(400)
    expect((await post('/api/annotations', { annotations: [box('a', 2)] })).status).toBe(200)
  })

  it('writes one image per annotated page plus an overview and prints per-page feedback', async () => {
    const { decided } = await start({ source: { label: 'deck.pptx', newer: false } })
    await post('/api/annotations', {
      annotations: [
        { id: 'g', type: 'comment', geometry: null, text: 'Overall fine' },
        box('b', 3), box('a', 1),
        { id: 'c', type: 'comment', geometry: null, text: 'Too dense', page: 3 }
      ]
    })
    expect((await post('/api/feedback', {})).status).toBe(200)
    const { output, approved, annotationCount, annotations } = await decided
    expect(approved).toBe(false)
    expect(annotationCount).toBe(4)
    expect(annotations.map((a) => a.id)).toEqual(['a', 'b', 'c', 'g'])
    expect(output).toMatch(/^4 annotations on 2 of 3 pages\.\n\nSource: deck\.pptx \(rendered as deck\.pdf\)\n/)
    expect(output).toMatch(/## Page 1\nAnnotated page: .*page-01\.png\n\n### 1\. Boxed area/)
    expect(output).toMatch(/## Page 3\nAnnotated page: .*page-03\.png\n\n### 2\. Boxed area[^\n]*\nText: text "Three"\n> note b\n\n### 3\. Page comment\n> Too dense/)
    expect(output).toContain('Text and Quote lines are read from the PDF')
    expect(output).toMatch(/## General\n### 4\. General comment about the whole document/)

    const overview = output.match(/Overview: (.*)\n/)[1]
    expect((await readdir(dirname(overview))).sort()).toEqual(['overview.png', 'page-01.png', 'page-03.png'])
    // The legend under the page makes the annotated image taller than the page.
    const annotated = await loadImage(join(dirname(overview), 'page-03.png'))
    expect(annotated.width).toBe(2000)
    expect(annotated.height).toBeGreaterThan(1125)
    await rm(dirname(overview), { recursive: true, force: true })
  })

  it('serves the text of a page as elements and names the text a mark covers', async () => {
    const textPdf = join(dir, 'text.pdf')
    await writeFile(textPdf, await makePdf([{ title: 'Revenue by region', body: ['North grew 12%', 'South stayed flat'] }]))
    const document = await openPdfDocument(textPdf)
    server = await buildDocumentServer({ document, targetLabel: 'text.pdf' })
    const { elements } = (await (await fetch(`${server.url}/api/pages/1/elements`)).json()).data
    expect(elements.map((e) => [e.tag, e.name])).toEqual([['heading', 'Revenue by region'], ['text', 'North grew 12% South stayed flat']])
    expect((await fetch(`${server.url}/api/pages/2/elements`)).status).toBe(404)

    const heading = elements[0].box
    const pin = { id: 'p', type: 'pin', geometry: { x: heading.x + 10, y: heading.y + 10 }, text: 'Shorter', page: 1 }
    const body = await (await post('/api/feedback-text', { annotations: [pin] })).json()
    expect(body.data.text).toContain('Text: heading "Revenue by region"\n> Shorter')
  })

  it('serves last round with marks on pages outside this review as orphans', async () => {
    const thread = (id, page) => ({ handle: id, number: 1, annotation: box(id, page), element: null, replies: [] })
    await start({
      pageRanges: [{ from: 1, to: 2 }],
      session: {
        sessionId: '2f8c1a9e04b7',
        target: { kind: 'document', label: 'deck.pdf' },
        fingerprint: 'sha256:b',
        previous: { round: 1, fingerprint: 'sha256:a', threads: [thread('a1a1a1a1', 1), thread('b2b2b2b2', 3)] }
      }
    })
    const { data } = await (await fetch(`${server.url}/api/threads`)).json()
    expect(data.threads.map((t) => [t.anchor, t.reason])).toEqual([
      ['ghost', 'The target changed since round 1, the mark shows where it was then'],
      ['orphan', 'Page 3 is not part of this review']
    ])
  })

  it('approves without notes when nothing was annotated', async () => {
    const { decided } = await start()
    expect((await post('/api/approve', {})).status).toBe(200)
    const decision = await decided
    expect(decision.output).toBe('APPROVED: No changes requested.\n')
    expect(decision.annotations).toEqual([])
  })

  it('renders one page with its markup for copying, numbered as in the feedback', async () => {
    await start()
    const res = await post('/api/annotated-image', { annotations: [box('a', 1), box('b', 2)], page: 2 })
    expect(res.status).toBe(200)
    const image = await loadImage(Buffer.from(await res.arrayBuffer()))
    expect(image.width).toBe(1413)
    expect((await post('/api/annotated-image', { annotations: [], page: 7 })).status).toBe(400)
  })

  it('describes annotations as Markdown without temp paths', async () => {
    await start()
    const body = await (await post('/api/feedback-text', { annotations: [box('a', 2)] })).json()
    expect(body.data.text).toMatch(/^1 annotation on 1 of 3 pages\./)
    expect(body.data.text).not.toMatch(/\/tmp|annotaitr-/)
  })

  const replySession = () => {
    const previous = { round: 1, threads: [{ handle: 'a3f19c2e', number: 1, annotation: box('a', 1), element: null, replies: [] }] }
    return { sessionId: '2f8c1a9e04b7', target: { kind: 'document', label: 'x' }, previous, fingerprint: null, replies: createReplyStore(previous) }
  }

  it('accepts feedback that only carries replies to last round', async () => {
    const session = replySession()
    const { decided } = await start({ session })
    session.replies.add('a3f19c2e', 'Green')
    expect((await post('/api/feedback', {})).status).toBe(200)
    expect(await decided).toMatchObject({ approved: false, output: '', annotations: [], repliesOnly: true, annotationCount: 1 })
  })

  it('still rejects feedback without marks and without replies', async () => {
    await start({ session: replySession() })
    expect((await post('/api/feedback', {})).status).toBe(400)
  })

  it('approves with notes when only replies are pending', async () => {
    const session = replySession()
    const { decided } = await start({ session })
    session.replies.add('a3f19c2e', 'Green')
    await post('/api/approve', {})
    expect(await decided).toMatchObject({ approved: true, repliesOnly: true, annotationCount: 1 })
  })

  it('freezes the replies once a decision is made and carries them in the decision', async () => {
    const session = replySession()
    const { decided } = await start({ session })
    session.replies.add('a3f19c2e', 'Green')
    await post('/api/approve', {})
    expect(session.replies.add('a3f19c2e', 'late').status).toBe(409)
    const decision = await decided
    expect(decision.replyCount).toBe(1)
    expect(decision.carried).toHaveLength(1)
  })

  it('freezes the replies on a plain approve', async () => {
    const session = replySession()
    const { decided } = await start({ session })
    await post('/api/approve', {})
    expect(session.replies.add('a3f19c2e', 'late').status).toBe(409)
    expect(await decided).toMatchObject({ carried: [], replyCount: 0 })
  })
})
