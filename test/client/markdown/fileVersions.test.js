import { describe, it, expect } from 'vitest'
import { newFileText, isMarkdownPath, canRead, fileView, readBlocks, readPathOf, readViewsOf } from '../../../client/markdown/src/utils/fileVersions.js'

describe('newFileText', () => {
  it('keeps context and added lines without their sign and drops removed lines', () => {
    const diff = ['@@ -1,3 +1,3 @@', ' # Title', '-old line', '+new line', ' end'].join('\n')
    expect(newFileText(diff)).toBe('# Title\nnew line\nend')
  })

  it('keeps a blank context line as an empty line', () => {
    const diff = ['@@ -1,3 +1,4 @@', ' a', ' ', '+b', ' c'].join('\n')
    expect(newFileText(diff)).toBe('a\n\nb\nc')
  })

  it('skips the no-newline marker', () => {
    const diff = ['@@ -1 +1 @@', '-a', '\\ No newline at end of file', '+b', '\\ No newline at end of file'].join('\n')
    expect(newFileText(diff)).toBe('b')
  })

  it('reads an untracked file from its /dev/null diff with headers', () => {
    const diff = ['diff --git a/notes.md b/notes.md', 'new file mode 100644', 'index 0000000..e69de29', '--- /dev/null', '+++ b/notes.md', '@@ -0,0 +1,2 @@', '+# Notes', '+Text', ''].join('\n')
    expect(newFileText(diff)).toBe('# Notes\nText')
  })

  it('is empty for a deleted file', () => {
    expect(newFileText(['@@ -1,2 +0,0 @@', '-# Gone', '-text'].join('\n'))).toBe('')
  })
})

describe('isMarkdownPath', () => {
  it('knows the markdown extensions of markdown mode, in any case', () => {
    expect(['a.md', 'docs/usage.markdown', 'x.mdown', 'y.mkd', 'README.MD'].map(isMarkdownPath)).toEqual([true, true, true, true, true])
  })

  it('rejects other files', () => {
    expect(['a.js', 'md', 'notes.md.bak', 'a.mdx'].map(isMarkdownPath)).toEqual([false, false, false, false])
  })
})

describe('canRead', () => {
  const file = { path: 'docs/usage.md', status: 'M', hasDiff: true }

  it('offers Read for an added or modified markdown file with a diff', () => {
    expect(canRead(file)).toBe(true)
    expect(canRead({ ...file, status: 'A' })).toBe(true)
  })

  it('offers no Read for a deleted file, a file without diff or another kind of file', () => {
    expect(canRead({ ...file, status: 'D' })).toBe(false)
    expect(canRead({ ...file, hasDiff: false })).toBe(false)
    expect(canRead({ ...file, path: 'src/a.js' })).toBe(false)
  })
})

describe('fileView', () => {
  const file = { path: 'docs/usage.md', status: 'M', hasDiff: true }

  it('takes the view picked for the file before the default', () => {
    expect(fileView(new Map([['docs/usage.md', 'diff']]), file, 'read')).toBe('diff')
    expect(fileView(new Map([['docs/usage.md', 'read']]), file, 'diff')).toBe('read')
  })

  it('falls back to the default for a file not set by hand', () => {
    expect(fileView(new Map(), file, 'read')).toBe('read')
    expect(fileView(new Map(), file, 'diff')).toBe('diff')
  })

  it('stays on diff for a file that cannot be read, whatever was picked', () => {
    expect(fileView(new Map([['src/a.js', 'read']]), { ...file, path: 'src/a.js' }, 'read')).toBe('diff')
    expect(fileView(new Map(), { ...file, status: 'D' }, 'read')).toBe('diff')
  })

  it('treats an unknown stored default as diff', () => {
    expect(fileView(new Map(), file, 'rendered')).toBe('diff')
  })
})

describe('readBlocks', () => {
  const diff = ['@@ -1,3 +1,4 @@', ' # Usage', ' ', '-Old.', '+First line', '+second line.', ' > Quoted'].join('\n')

  it('parses the new file with ids that name the file, its path and where the card sorts', () => {
    const blocks = readBlocks('docs/usage.md', diff, 12)
    expect(blocks.map((b) => [b.id, b.type, b.startLine])).toEqual([
      ['read:docs/usage.md:block-0', 'heading', 1],
      ['read:docs/usage.md:block-1', 'paragraph', 3],
      ['read:docs/usage.md:block-2', 'blockquote', 5]
    ])
    expect(blocks.every((b) => b.path === 'docs/usage.md' && b.sortLine === 12)).toBe(true)
  })

  it('prefixes the parent of a nested block too', () => {
    const nested = ['@@ -0,0 +1,2 @@', '+> Quote', '+> - item'].join('\n')
    const blocks = readBlocks('a.md', nested, 1)
    const child = blocks.find((b) => b.parentId)
    expect(child.parentId).toBe('read:a.md:block-0')
  })
})

describe('readViewsOf', () => {
  const diff = ['@@ -0,0 +1 @@', '+# New'].join('\n')
  const file = (path, lines, extra = {}) => ({ path, status: 'A', hasDiff: true, heading: { startLine: lines[0] }, blocks: lines.slice(1).map((startLine) => ({ startLine })), ...extra })

  it('builds the blocks of every loaded markdown file, sorted after the last line of its card', () => {
    const files = [file('a.md', [7, 9, 11]), file('b.md', [20]), file('c.js', [30, 32]), file('d.md', [40, 42])]
    const entries = new Map([['a.md', { diff }], ['b.md', { loading: true, diff: null }], ['c.js', { diff }], ['d.md', { diff: null, error: 'gone' }]])
    const views = readViewsOf(files, entries)
    expect([...views.keys()]).toEqual(['a.md'])
    expect(views.get('a.md').map((b) => [b.id, b.sortLine])).toEqual([['read:a.md:block-0', 11]])
  })

  it('sorts after the focus line too when that is the card\'s last', () => {
    const views = readViewsOf([file('a.md', [7], { focusBlock: { startLine: 9 } })], new Map([['a.md', { diff }]]))
    expect(views.get('a.md')[0].sortLine).toBe(9)
  })
})

describe('readPathOf', () => {
  it('reads the path back from a Read block id, colons included', () => {
    expect(readPathOf('read:docs/usage.md:block-3')).toBe('docs/usage.md')
    expect(readPathOf('read:c:/x.md:block-12')).toBe('c:/x.md')
  })

  it('is null for any other block', () => {
    expect(readPathOf('block-3')).toBeNull()
    expect(readPathOf('')).toBeNull()
    expect(readPathOf(undefined)).toBeNull()
  })
})
