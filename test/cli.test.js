import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { parseArgs, detectMode, isVideoTarget } from '../index.js'

const BASE = ['node', 'index.js']

describe('parseArgs', () => {
  it('parses a bare markdown target', () => {
    expect(parseArgs([...BASE, 'README.md'])).toEqual({
      targets: ['README.md'],
      origin: 'cli',
      viewportSpec: null,
      feedbackNotes: null,
      modeOverride: null,
      viewportFlagGiven: false,
      feedbackNotesFlagGiven: false
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

  it('errors when --viewport has no value', () => {
    expect(parseArgs([...BASE, '--viewport']).error).toMatch(/--viewport requires/)
  })

  it('errors when --feedback-notes has no value', () => {
    expect(parseArgs([...BASE, '--feedback-notes']).error).toMatch(/--feedback-notes requires/)
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
