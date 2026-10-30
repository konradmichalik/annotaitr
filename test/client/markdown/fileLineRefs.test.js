import { describe, it, expect } from 'vitest'
import { createFileLineRefFinder, previewLines } from '../../../client/markdown/src/utils/fileLineRefs.js'

const paths = new Set(['src/Cache.php', 'src/Cache.php.bak', 'docs/a.b.md'])
const findFileLineRef = (text, among = paths) => createFileLineRefFinder(among)(text)

describe('createFileLineRefFinder', () => {
  it('finds a path with a line of the new file', () => {
    expect(findFileLineRef('The key in src/Cache.php:42 is now per workspace.', paths)).toEqual({
      index: 11, length: 16, path: 'src/Cache.php', start: 42, end: 42
    })
  })

  it('reads a range as its first and last line', () => {
    expect(findFileLineRef('See src/Cache.php:42-48.', paths)).toMatchObject({ path: 'src/Cache.php', start: 42, end: 48 })
  })

  it('prefers the longer of two paths that start alike', () => {
    expect(findFileLineRef('src/Cache.php.bak:3', paths)).toMatchObject({ path: 'src/Cache.php.bak', start: 3 })
  })

  it('keeps a dot in a file name literal', () => {
    expect(findFileLineRef('docs/a.b.md:7', paths)).toMatchObject({ path: 'docs/a.b.md' })
    expect(findFileLineRef('docs/aXb.md:7', paths)).toBeNull()
  })

  it('ignores a path that is not a changed file', () => {
    expect(findFileLineRef('src/Other.php:42', paths)).toBeNull()
  })

  it('ignores a path without a line, and a path that only ends with a known one', () => {
    expect(findFileLineRef('src/Cache.php is new', paths)).toBeNull()
    expect(findFileLineRef('vendor/src/Cache.php:42', paths)).toBeNull()
  })

  it('ignores a range that runs backwards and line zero', () => {
    expect(findFileLineRef('src/Cache.php:9-3', paths)).toBeNull()
    expect(findFileLineRef('src/Cache.php:0', paths)).toBeNull()
  })

  it('does not read a longer number or a word after the line as part of the reference', () => {
    expect(findFileLineRef('src/Cache.php:42x', paths)).toBeNull()
    expect(findFileLineRef('src/Cache.php:42:', paths)).toMatchObject({ start: 42, length: 16 })
  })

  it('has nothing to find without paths', () => {
    expect(findFileLineRef('src/Cache.php:42', new Set())).toBeNull()
  })
})

const DIFF = [
  '@@ -10,4 +10,5 @@',
  ' keep a',
  '-old b',
  '+new b',
  '+new c',
  ' keep d',
  '@@ -40,2 +41,2 @@',
  ' keep e',
  '+new f'
].join('\n')

describe('previewLines', () => {
  it('shows the line with its surroundings, numbered as in the new file', () => {
    const preview = previewLines(DIFF, 12, 12, 1)
    expect(preview.covered).toBe(true)
    expect(preview.lines).toEqual([
      { no: 11, text: 'new b' },
      { no: 12, text: 'new c' },
      { no: 13, text: 'keep d' }
    ])
  })

  it('skips removed lines, which have no number in the new file', () => {
    const texts = previewLines(DIFF, 11, 11, 3).lines.map((line) => line.text)
    expect(texts).not.toContain('old b')
  })

  it('shows a range with its surroundings', () => {
    expect(previewLines(DIFF, 11, 12, 0).lines.map((line) => line.no)).toEqual([11, 12])
  })

  it('says a line outside every hunk is not covered', () => {
    expect(previewLines(DIFF, 25, 25, 3)).toEqual({ covered: false, lines: [], more: 0 })
  })

  it('does not reach across the gap between two hunks', () => {
    expect(previewLines(DIFF, 30, 30, 3).covered).toBe(false)
  })

  it('shows at most twelve lines of a long range and counts the rest', () => {
    const long = ['@@ -1,30 +1,30 @@', ...Array.from({ length: 30 }, (_, i) => `+line ${i + 1}`)].join('\n')
    const preview = previewLines(long, 1, 30, 0)
    expect(preview.lines).toHaveLength(12)
    expect(preview.more).toBe(18)
  })

  it('does not take an empty trailing line for a line of the file', () => {
    const preview = previewLines('@@ -1,2 +1,2 @@\n+a\n+b\n', 3, 3, 0)
    expect(preview.covered).toBe(false)
  })
})
