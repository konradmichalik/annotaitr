import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { mkdtemp, mkdir, writeFile, rm, symlink, utimes } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { parseArgs, captureFlagError } from '../cli/args.js'
import { detectMode, isVideoTarget, isPdfTarget, rejoinSplitPath } from '../cli/detect.js'

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
      feedbackNotesFlagGiven: false,
      sourceSpec: null,
      pageRanges: null,
      sessionId: null,
      newSession: false
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
  })

  it('parses --as to force a mode', () => {
    expect(parseArgs([...BASE, '--as', 'image', './diagram.svg']).modeOverride).toBe('image')
  })

  it('parses --feedback-notes as an inline JSON array', () => {
    const result = parseArgs([...BASE, '--feedback-notes', '[{"text":"hi"}]', 'README.md'])
    expect(result.feedbackNotes).toEqual([{ text: 'hi' }])
    expect(result.feedbackNotesFlagGiven).toBe(true)
  })

  it('parses --session and --new-session', () => {
    expect(parseArgs([...BASE, '--session', '2f8c1a9e04b7', 'a.png']).sessionId).toBe('2f8c1a9e04b7')
    expect(parseArgs([...BASE, '--new-session', 'a.png'])).toMatchObject({ newSession: true, targets: ['a.png'] })
  })

  it('rejects a malformed session id before anything reads it', () => {
    expect(parseArgs([...BASE, '--session', '../x', 'a.png']).error).toMatch(/--session expects the 12-character id/)
    expect(parseArgs([...BASE, '--session']).error).toMatch(/--session requires/)
  })

  it('rejects --session together with --new-session', () => {
    expect(parseArgs([...BASE, '--session', '2f8c1a9e04b7', '--new-session', 'a.png']).error)
      .toBe('--session and --new-session cannot be combined')
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

  it('accepts gemini as an origin', () => {
    expect(parseArgs([...BASE, '--origin', 'gemini', 'http://x']).origin).toBe('gemini')
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

  it('does not take the next flag as the value of --viewport or --delay', () => {
    expect(parseArgs([...BASE, '--viewport', '--delay', '500', 'http://x']).error).toMatch(/--viewport requires/)
    expect(parseArgs([...BASE, 'http://x', '--delay', '--viewport', 'mobile']).error).toMatch(/--delay requires/)
  })

  it('errors on a malformed --pages range', () => {
    expect(parseArgs([...BASE, '--pages', '5-2', 'deck.pdf']).error).toMatch(/--pages: "5-2"/)
  })
})

describe('session flags', () => {
  it('rejects session flags for markdown targets', () => {
    const result = spawnSync('node', ['index.js', '--new-session', 'README.md'], NO_SERVER)
    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toMatch(/--session and --new-session only apply to image targets/)
  })
})

describe('captureFlagError', () => {
  it('names the flag and the target kind', () => {
    expect(captureFlagError('a PDF', { viewportSpec: 'mobile', delaySpec: null }))
      .toBe('--viewport only applies to a URL target, not a PDF.')
    expect(captureFlagError('a PDF', { viewportSpec: null, delaySpec: '0' }))
      .toBe('--delay only applies to a URL target, not a PDF.')
  })

  it('accepts a target without either flag', () => {
    expect(captureFlagError('a PDF', { viewportSpec: null, delaySpec: null })).toBeNull()
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

  it('detects several existing image files as image mode with a file set', async () => {
    const otherPngPath = join(dir, 'other.png')
    await writeFile(otherPngPath, Buffer.from('also-not-a-png'))
    expect(await detectMode([pngPath, otherPngPath])).toEqual({
      mode: 'image',
      capture: 'files',
      resolvedPaths: [pngPath, otherPngPath]
    })
  })

  it('errors on several targets when one is not an existing image file', async () => {
    const result = await detectMode([pngPath, 'http://localhost:3000'])
    expect(result.error).toMatch(/Could not determine a single mode/)
    expect(result.error).toMatch(/several image files/)
  })

  it('keeps video and PDF single-target', async () => {
    const video = join(dir, 'multi.mp4')
    await writeFile(video, 'x')
    const result = await detectMode([pngPath, video])
    expect(result.error).toMatch(/Could not determine a single mode/)
  })

  it('names the missing files among several targets and hints at quoting', async () => {
    const missing = join(dir, 'Digest')
    const result = await detectMode([missing, mdPath, '2026-10-10.md'])
    expect(result.error).toMatch(`File not found: ${missing}, ${resolvePath('2026-10-10.md')}`)
    expect(result.error).toMatch(/Quote a path that contains spaces/)
  })

  it('does not count a URL among several targets as a missing file', async () => {
    const result = await detectMode([pngPath, 'http://localhost:3000'])
    expect(result.error).not.toMatch(/File not found/)
  })

  it('names only the local path when a URL comes with a missing file', async () => {
    const missing = join(dir, 'gone.md')
    const result = await detectMode(['http://localhost:3000', missing])
    expect(result.error).toMatch(`File not found: ${missing}\n`)
  })
})

describe('rejoinSplitPath', () => {
  let dir, spacedPath

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-split-'))
    spacedPath = join(dir, 'Digest 2026-10-10.md')
    await writeFile(spacedPath, '# Digest')
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('rejoins a path the shell split at a space', async () => {
    expect(await rejoinSplitPath([join(dir, 'Digest'), '2026-10-10.md'])).toEqual([spacedPath])
  })

  it('rejoins a path split at several spaces', async () => {
    const path = join(dir, 'Notes from the call.md')
    await writeFile(path, '# Notes')
    expect(await rejoinSplitPath([join(dir, 'Notes'), 'from', 'the', 'call.md'])).toEqual([path])
  })

  it('leaves the targets alone when one of them exists', async () => {
    const partPath = join(dir, 'Digest')
    await writeFile(partPath, 'x')
    try {
      const targets = [partPath, '2026-10-10.md']
      expect(await rejoinSplitPath(targets)).toEqual(targets)
    } finally {
      await rm(partPath)
    }
  })

  it('leaves the targets alone when the joined path does not exist either', async () => {
    const targets = [join(dir, 'a'), 'b.md']
    expect(await rejoinSplitPath(targets)).toEqual(targets)
  })

  it('leaves a single target alone', async () => {
    const targets = [join(dir, 'missing.md')]
    expect(await rejoinSplitPath(targets)).toEqual(targets)
  })
})

describe('target split at a space by an unquoted shell call', () => {
  let dir

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-split-cli-'))
    await writeFile(join(dir, 'Q3 deck.pptx'), 'x')
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('treats the parts as the one file they name', () => {
    const result = spawnSync('node', ['index.js', join(dir, 'Q3'), 'deck.pptx'])
    expect(result.status).toBe(0)
    expect(result.stdout.toString()).toMatch('Q3 deck')
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

describe('help text', () => {
  it('documents the session flags, the reply subcommand and the session dir', () => {
    const { stderr } = spawnSync('node', ['index.js', '--help'], { encoding: 'utf-8' })
    expect(stderr).toContain('annotaitr reply --session <id> --to <handle> --status <status> --text <text>')
    expect(stderr).toContain('--session <id>')
    expect(stderr).toContain('--new-session')
    expect(stderr).toContain('ANNOTAITR_SESSION_DIR')
  })
})

describe('several image targets', () => {
  let dir, pngPath, otherPngPath

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'annotaitr-set-'))
    pngPath = join(dir, 'a.png')
    otherPngPath = join(dir, 'b.png')
    await writeFile(pngPath, Buffer.from('not-really-a-png'))
    await writeFile(otherPngPath, Buffer.from('not-really-a-png'))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const run = (...args) => spawnSync('node', ['index.js', ...args])

  it('names the file that is missing', () => {
    const result = run('--as', 'image', pngPath, join(dir, 'missing.png'))
    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toMatch(/File not found: .*missing\.png/)
  })

  it.each([['http://localhost:3000'], ['deck.pdf'], ['clip.mp4']])('rejects %s next to an image', (other) => {
    const result = run('--as', 'image', pngPath, other)
    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toMatch(/Several targets must all be image files/)
  })

  it('rejects a review session', () => {
    const result = run('--new-session', pngPath, otherPngPath)
    expect(result.status).toBe(1)
    expect(result.stderr.toString()).toMatch(/only apply to a single image target/)
  })

  it('rejects capture flags', () => {
    const result = run('--viewport', 'mobile', pngPath, otherPngPath)
    expect(result.status).toBe(1)
  })
})
