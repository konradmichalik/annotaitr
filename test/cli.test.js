import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { mkdtemp, mkdir, writeFile, rm, symlink, utimes } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { parseArgs, detectMode, isVideoTarget, isPdfTarget } from '../index.js'

// For CLI runs that must be rejected up front: if one ever starts a server
// instead, it opens no browser and fails on the timeout rather than hanging.
const NO_SERVER = { env: { ...process.env, ANNOTAITR_NO_OPEN: '1' }, timeout: 10_000 }

const BASE = ['node', 'index.js']

describe('parseArgs', () => {
  it('parses a bare markdown target', () => {
    expect(parseArgs([...BASE, 'README.md'])).toEqual({
      targets: ['README.md'],
      origin: 'cli',
      viewportSpec: null,
      delaySpec: null,
      feedbackNotes: null,
      modeOverride: null,
      viewportFlagGiven: false,
      feedbackNotesFlagGiven: false,
      sourceSpec: null,
      pageRanges: null
    })
  })

  it('parses multiple markdown targets', () => {
    expect(parseArgs([...BASE, 'a.md', 'b.md']).targets).toEqual(['a.md', 'b.md'])
  })

  it('parses a bare URL target', () => {
    expect(parseArgs([...BASE, 'http://localhost:3000']).targets).toEqual(['http://localhost:3000'])
  })

  it('parses --viewport and --origin', () => {
    const result = parseArgs([...BASE, '--viewport', 'mobile', '--origin', 'claude-code', 'http://x'])
    expect(result.targets).toEqual(['http://x'])
    expect(result.origin).toBe('claude-code')
    expect(result.viewportSpec).toBe('mobile')
    expect(result.viewportFlagGiven).toBe(true)
  })

  it('parses --as to force a mode', () => {
    expect(parseArgs([...BASE, '--as', 'image', './diagram.svg']).modeOverride).toBe('image')
  })

  it('parses --feedback-notes as an inline JSON array', () => {
    const result = parseArgs([...BASE, '--feedback-notes', '[{"text":"hi"}]', 'README.md'])
    expect(result.feedbackNotes).toEqual([{ text: 'hi' }])
    expect(result.feedbackNotesFlagGiven).toBe(true)
  })

  it('reports --help', () => {
    expect(parseArgs([...BASE, '--help'])).toEqual({ help: true })
  })

  it('falls back to no targets (clipboard read) when none is given', () => {
    expect(parseArgs(BASE).targets).toEqual([])
  })

  it('errors on an unknown option', () => {
    expect(parseArgs([...BASE, '--bogus']).error).toMatch(/Unknown option/)
  })

  it('errors on an unknown origin', () => {
    expect(parseArgs([...BASE, '--origin', 'nope', 'http://x']).error).toMatch(/Unknown origin/)
  })

  it('errors on an unknown --as value', () => {
    expect(parseArgs([...BASE, '--as', 'bogus', 'x']).error).toMatch(/--as requires/)
  })

  it('parses --delay', () => {
    expect(parseArgs([...BASE, '--delay', '750', 'http://x']).delaySpec).toBe('750')
  })

  it('errors when --delay has no value', () => {
    expect(parseArgs([...BASE, '--delay']).error).toMatch(/--delay requires/)
  })

  it('errors when --viewport has no value', () => {
    expect(parseArgs([...BASE, '--viewport']).error).toMatch(/--viewport requires/)
  })

  it('errors when --feedback-notes has no value', () => {
    expect(parseArgs([...BASE, '--feedback-notes']).error).toMatch(/--feedback-notes requires/)
  })

  it('parses --source and --pages', () => {
    const result = parseArgs([...BASE, '--source', 'deck.pptx', '--pages', '1-3,9-', 'deck.pdf'])
    expect(result.sourceSpec).toBe('deck.pptx')
    expect(result.pageRanges).toEqual([{ from: 1, to: 3 }, { from: 9, to: null }])
  })

  it('errors when --source or --pages has no value', () => {
    expect(parseArgs([...BASE, '--source']).error).toMatch(/--source requires/)
    expect(parseArgs([...BASE, '--pages']).error).toMatch(/--pages requires/)
  })

  it('does not take the next flag as the value of --source or --pages', () => {
    expect(parseArgs([...BASE, 'deck.pdf', '--source', '--pages', '1-2']).error).toMatch(/--source requires/)
    expect(parseArgs([...BASE, 'deck.pdf', '--pages', '--source', 'deck.pptx']).error).toMatch(/--pages requires/)
  })

  it('errors on a malformed --pages range', () => {
    expect(parseArgs([...BASE, '--pages', '5-2', 'deck.pdf']).error).toMatch(/--pages: "5-2"/)
  })
})

describe('detectMode', () => {
  let dir, mdPath, otherMdPath, pngPath

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-cli-'))
    mdPath = join(dir, 'doc.md')
    otherMdPath = join(dir, 'other.md')
    pngPath = join(dir, 'shot.png')

    await writeFile(mdPath, '# Hello')
    await writeFile(otherMdPath, '# World')
    await writeFile(pngPath, Buffer.from('not-really-a-png'))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('detects a single markdown file as markdown mode', async () => {
    expect(await detectMode([mdPath])).toEqual({ mode: 'markdown', resolvedPaths: [mdPath] })
  })

  it('detects multiple markdown files as markdown mode', async () => {
    expect(await detectMode([mdPath, otherMdPath])).toEqual({
      mode: 'markdown',
      resolvedPaths: [mdPath, otherMdPath]
    })
  })

  it('detects a single http(s) URL as image mode', async () => {
    expect(await detectMode(['http://localhost:3000'])).toEqual({
      mode: 'image',
      capture: 'url',
      target: 'http://localhost:3000'
    })
  })

  it('detects a single existing image file as image mode', async () => {
    expect(await detectMode([pngPath])).toEqual({ mode: 'image', capture: 'file', resolvedPath: pngPath })
  })

  it.each([['clip.mp4'], ['rec.mov'], ['anim.gif'], ['flow.webm']])('detects an existing %s as image mode with a video capture', async (name) => {
    const path = join(dir, name)
    await writeFile(path, 'x')
    expect(await detectMode([path])).toEqual({ mode: 'image', capture: 'video', resolvedPath: path })
  })

  it('detects an existing PDF as image mode with a document capture', async () => {
    const path = join(dir, 'deck.pdf')
    await writeFile(path, 'x')
    expect(await detectMode([path])).toEqual({ mode: 'image', capture: 'document', resolvedPath: path })
  })

  it('names PDFs among the supported extensions in the error', async () => {
    expect((await detectMode([join(dir, 'missing.xyz')])).error).toMatch(/\.pdf/)
  })

  it('errors on a mix of markdown and image targets', async () => {
    const result = await detectMode([mdPath, pngPath])
    expect(result.error).toMatch(/Could not determine a single mode/)
  })

  it('errors on an unrecognized single target', async () => {
    const result = await detectMode([join(dir, 'diagram.svg')])
    expect(result.error).toMatch(/Unsupported target/)
    expect(result.error).toMatch(/--as/)
  })

  it('errors on more than one image-shaped target', async () => {
    const otherPngPath = join(dir, 'other.png')
    await writeFile(otherPngPath, Buffer.from('also-not-a-png'))
    const result = await detectMode([pngPath, otherPngPath])
    expect(result.error).toMatch(/Could not determine a single mode/)
  })
})

describe('pasted chat image chip as target', () => {
  // The shell treats `#1]` of `[Image #1]` as a comment, so only `[Image`
  // arrives. Exiting 0 keeps Claude Code from aborting the slash command.
  it.each([['[Image'], ['[Image #1]']])('points the agent at the image source path for %s', (chip) => {
    const result = spawnSync('node', ['index.js', '--origin', 'claude-code', chip])
    expect(result.status).toBe(0)
    expect(result.stdout.toString()).toMatch(/^PASTED CHAT IMAGE:/)
    expect(result.stdout.toString()).toContain('[Image: source:')
  })

  it('takes precedence over a forced mode', () => {
    const result = spawnSync('node', ['index.js', '--as', 'image', '[Image'])
    expect(result.status).toBe(0)
    expect(result.stdout.toString()).toMatch(/^PASTED CHAT IMAGE:/)
  })
})

describe('isVideoTarget', () => {
  it('takes a local video or GIF path', () => {
    expect(isVideoTarget('./rec.mov')).toBe(true)
    expect(isVideoTarget('/tmp/anim.gif')).toBe(true)
  })

  it('leaves a URL to page capture, even when it ends in a video extension', () => {
    expect(isVideoTarget('https://example.com/demo.mp4')).toBe(false)
  })
})

describe('video targets', () => {
  let dir, videoPath

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-cli-video-'))
    videoPath = join(dir, 'clip.mp4')
    await writeFile(videoPath, 'x')
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('rejects --delay for a video, which is never captured', () => {
    const result = spawnSync('node', ['index.js', '--delay', '500', videoPath], NO_SERVER)
    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toMatch(/--delay only applies to a URL target/)
  })

  it('rejects an out-of-range --delay before capturing anything', () => {
    const result = spawnSync('node', ['index.js', '--delay', '99999', 'http://127.0.0.1:9/'], NO_SERVER)
    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toMatch(/--delay must be a whole number of milliseconds from 0 to 10000/)
  })

  it('rejects --viewport for a video, which is never captured', () => {
    const result = spawnSync('node', ['index.js', '--viewport', 'mobile', videoPath])
    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toMatch(/--viewport only applies to a URL target/)
  })

  it('reports a missing video forced with --as image', () => {
    const result = spawnSync('node', ['index.js', '--as', 'image', join(dir, 'missing.mp4')])
    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toMatch(/File not found/)
  })
})

describe('isPdfTarget', () => {
  it('takes a local PDF path but leaves a URL to page capture', () => {
    expect(isPdfTarget('./deck.pdf')).toBe(true)
    expect(isPdfTarget('https://example.com/deck.pdf')).toBe(false)
  })
})

describe('office documents', () => {
  let dir

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-cli-office-'))
    await writeFile(join(dir, 'deck.pptx'), 'x')
    await mkdir(join(dir, 'talk.key'))
    await writeFile(join(dir, 'talk.key', 'Index.zip'), 'x')
    await writeFile(join(dir, 'memo.docx'), 'x')
    await utimes(join(dir, 'memo.docx'), new Date(1000), new Date(1000))
    await writeFile(join(dir, 'memo.pdf'), 'x')
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('prints a convert hint with the command to run and exits 0', () => {
    const result = spawnSync('node', ['index.js', '--origin', 'claude-code', join(dir, 'deck.pptx')], NO_SERVER)
    expect(result.status).toBe(0)
    const out = result.stdout.toString()
    expect(out).toMatch(/^CONVERT TO PDF FIRST: /)
    expect(out).toContain(`annotaitr ${join(dir, 'deck.pdf')} --source ${join(dir, 'deck.pptx')}`)
  })

  it('points at an existing, current PDF next to the document', () => {
    const result = spawnSync('node', ['index.js', join(dir, 'memo.docx')], NO_SERVER)
    expect(result.status).toBe(0)
    expect(result.stdout.toString()).toMatch(/memo\.pdf already exists/)
  })

  it('handles a Keynote package directory with a trailing slash', () => {
    const result = spawnSync('node', ['index.js', `${join(dir, 'talk.key')}/`], NO_SERVER)
    expect(result.status).toBe(0)
    expect(result.stdout.toString()).toContain(`annotaitr ${join(dir, 'talk.pdf')} --source ${join(dir, 'talk.key')}`)
  })

  it('reports a missing office document instead of the generic detection error', () => {
    const result = spawnSync('node', ['index.js', join(dir, 'missing.pptx')], NO_SERVER)
    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toMatch(/File not found: .*missing\.pptx/)
  })

  it('takes precedence over a forced mode', () => {
    const result = spawnSync('node', ['index.js', '--as', 'image', join(dir, 'deck.pptx')], NO_SERVER)
    expect(result.status).toBe(0)
    expect(result.stdout.toString()).toMatch(/^CONVERT TO PDF FIRST:/)
  })
})

describe('PDF-only flags', () => {
  let dir, pdfPath, mdPath

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-cli-pdf-'))
    pdfPath = join(dir, 'deck.pdf')
    mdPath = join(dir, 'notes.md')
    await writeFile(pdfPath, 'x')
    await writeFile(mdPath, '# Notes')
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it.each([['--source', 'deck.pptx'], ['--pages', '1-2']])('rejects %s for a target that is not a PDF', (flag, value) => {
    const result = spawnSync('node', ['index.js', flag, value, mdPath], NO_SERVER)
    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toMatch(new RegExp(`${flag} only applies to a PDF target`))
  })

  it('rejects --viewport and --delay for a PDF, which is never captured', () => {
    const viewport = spawnSync('node', ['index.js', '--viewport', 'mobile', pdfPath], NO_SERVER)
    expect(viewport.status).toBe(1)
    expect(viewport.stderr.toString()).toMatch(/--viewport only applies to a URL target, not a PDF/)
    const delay = spawnSync('node', ['index.js', '--delay', '100', pdfPath], NO_SERVER)
    expect(delay.status).toBe(1)
    expect(delay.stderr.toString()).toMatch(/--delay only applies to a URL target, not a PDF/)
  })

  it('reports a missing --source', () => {
    const result = spawnSync('node', ['index.js', '--source', join(dir, 'missing.pptx'), pdfPath], NO_SERVER)
    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toMatch(/Source not found/)
  })

  it('reports a missing PDF forced with --as image', () => {
    const result = spawnSync('node', ['index.js', '--as', 'image', join(dir, 'missing.pdf')], NO_SERVER)
    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toMatch(/File not found/)
  })
})

describe('bin invocation through a symlink', () => {
  // Mirrors how npm sets up a global install: bin/annotaitr is a symlink to
  // this file. import.meta.url resolves through it, so process.argv[1] must
  // be resolved the same way or the "run only when executed directly" guard
  // never matches and the CLI silently does nothing.
  let dir, linkPath

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-bin-'))
    linkPath = join(dir, 'annotaitr')
    await symlink(resolvePath('index.js'), linkPath)
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('runs main() and prints help when invoked via a symlinked bin', () => {
    const result = spawnSync('node', [linkPath, '--help'])
    expect(result.stderr.toString()).toMatch(/Usage:/)
    expect(result.status).toBe(0)
  })
})
