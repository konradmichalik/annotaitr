import { describe, it, expect } from 'vitest'
import { buildWalkthrough, fenceFor, hunksOnly } from '../../../server/changes/walkthrough.js'

const compared = { branch: 'feature/x', base: 'main', mergeBase: '3e1f0a7c9d' }
const diff = 'diff --git a/a.js b/a.js\nindex 1..2 100644\n--- a/a.js\n+++ b/a.js\n@@ -1 +1 @@\n-a\n+b\n'

describe('fenceFor', () => {
  it('uses four backticks, or one more than the longest run in the text', () => {
    expect(fenceFor('no fence here')).toBe('````')
    expect(fenceFor('+```js\n+````')).toBe('`````')
  })
})

describe('hunksOnly', () => {
  it('drops the file headers before the first hunk and the trailing newline', () => {
    expect(hunksOnly(diff)).toBe('@@ -1 +1 @@\n-a\n+b')
  })
})

describe('buildWalkthrough', () => {
  const files = [
    { path: 'a.js', status: 'M', added: 1, removed: 1, diff },
    { path: 'b.json', status: 'A', added: 3, removed: 0, diff: '@@ -0,0 +1,3 @@\n+{\n+}\n+' }
  ]

  it('puts the agent text and what was compared on top', () => {
    const md = buildWalkthrough({
      explanation: { title: 'Fix it', summary: 'Why it changed.', commit: 'fix: it' },
      compared,
      files
    })
    expect(md.startsWith('# Fix it\n\nWhy it changed.\n')).toBe(true)
    expect(md).toContain('**Compared:** `feature/x` against `main` (merge base `3e1f0a7`), working tree and untracked files included. 2 files, +4 −1.')
    expect(md).toContain('**After approval:** `fix: it`')
  })

  it('names uncommitted changes against HEAD', () => {
    const md = buildWalkthrough({ explanation: {}, compared: { branch: 'feature/x', base: 'HEAD', mergeBase: '9b2d4c1aa', uncommitted: true }, files })
    expect(md).toContain('**Compared:** uncommitted changes on `feature/x` against `HEAD` (`9b2d4c1`), untracked files included. 2 files, +4 −1.')
  })

  it('gives every file a section with the real hunks in a path fence', () => {
    const md = buildWalkthrough({ explanation: { files: { 'a.js': 'Renames a.' } }, compared, files })
    expect(md).toContain('## a.js\n\nRenames a.\n\n````diff a.js\n@@ -1 +1 @@\n-a\n+b\n````')
    expect(md).toContain('## b.json (new file)')
  })

  it('flags files the agent did not explain, in the overview and in their section', () => {
    const md = buildWalkthrough({ explanation: { files: { 'a.js': 'Renames a.' } }, compared, files })
    expect(md).toContain('**Not explained:** `b.json`')
    expect(md).toContain('## b.json (new file)\n\n_Not explained._')
  })

  it('warns about explanations for paths that did not change', () => {
    const md = buildWalkthrough({ explanation: { files: { 'gone.js': 'x', 'a.js': 'y', 'b.json': 'z' } }, compared, files })
    expect(md).toContain('**Explained but unchanged:** `gone.js`')
    expect(md).not.toContain('**Not explained:**')
  })

  it('names an omitted file with its counts instead of hunks', () => {
    const md = buildWalkthrough({
      explanation: {},
      compared,
      files: [{ path: 'package-lock.json', status: 'M', added: 120, removed: 80, diff: null, omitted: 'lock file' }]
    })
    expect(md).toContain('## package-lock.json\n\n_Not explained._\n\n+120 −80, not shown: lock file.')
    expect(md).not.toContain('````diff package-lock.json')
  })

  it('falls back to a neutral title without an explanation', () => {
    expect(buildWalkthrough({ explanation: {}, compared, files }).startsWith('# Changes on feature/x\n')).toBe(true)
  })
})
