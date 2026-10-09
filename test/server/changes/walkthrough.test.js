import { describe, it, expect } from 'vitest'
import { buildWalkthrough, fenceFor, hunksOnly, inlineCode } from '../../../server/changes/walkthrough.js'

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

describe('inlineCode', () => {
  it('keeps text in one code span, with backticks and control characters made harmless', () => {
    expect(inlineCode('fix: escape `x`')).toBe('`fix: escape \u02CBx\u02CB`')
    expect(inlineCode('a\nb.js')).toBe('`"a\\nb.js"`')
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

  it('lists the commits of the branch as annotatable lines in the overview', () => {
    const md = buildWalkthrough({
      explanation: {},
      compared: { ...compared, commits: [{ sha: 'a1b2c3d', subject: 'feat: add a' }, { sha: 'e4f5a6b', subject: 'fix: typo' }] },
      files
    })
    expect(md).toContain('**Commits:**\n\n- `a1b2c3d` `feat: add a`\n- `e4f5a6b` `fix: typo`')
    expect(md.indexOf('**Commits:**')).toBeLessThan(md.indexOf('## `a.js`'))
  })

  it('names uncommitted changes against HEAD', () => {
    const md = buildWalkthrough({ explanation: {}, compared: { branch: 'feature/x', base: 'HEAD', mergeBase: '9b2d4c1aa', uncommitted: true }, files })
    expect(md).toContain('**Compared:** uncommitted changes on `feature/x` against `HEAD` (`9b2d4c1`), untracked files included. 2 files, +4 −1.')
  })

  it('gives every file a section with the real hunks in a path fence', () => {
    const md = buildWalkthrough({ explanation: { files: { 'a.js': 'Renames a.' } }, compared, files })
    expect(md).toContain('## `a.js`\n\nRenames a.\n\n````diff a.js\n@@ -1 +1 @@\n-a\n+b\n````')
    expect(md).toContain('## `b.json` (new file)')
  })

  it('flags files the agent did not explain, in the overview and in their section', () => {
    const md = buildWalkthrough({ explanation: { files: { 'a.js': 'Renames a.' } }, compared, files })
    expect(md).toContain('**Not explained:** `b.json`')
    expect(md).toContain('## `b.json` (new file)\n\nThe agent did not mention this change.')
  })

  it('counts the files the agent did not explain once there are more than five', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ path: `f${i}.js`, status: 'M', added: 1, removed: 0, diff: '@@ -1 +1 @@\n+x' }))
    expect(buildWalkthrough({ explanation: {}, compared, files: many })).toContain('**Not explained:** 6 files, marked in the file tree')
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
    expect(md).toContain('## `package-lock.json`\n\nThe agent did not mention this change.\n\n+120 −80, not shown: lock file.')
    expect(md).not.toContain('````diff package-lock.json')
  })

  it('keeps a title, a commit message and a file line on one line', () => {
    const md = buildWalkthrough({ explanation: { title: 'One\n## Two', commit: 'fix: a\nb', files: { 'a.js': 'Line\n## x' } }, compared, files })
    expect(md.startsWith('# One ## Two\n')).toBe(true)
    expect(md).toContain('**After approval:** `fix: a b`')
    expect(md).toContain('Line ## x')
  })

  it('orders the files by group, each once, with the rest under Everything else', () => {
    const three = [...files, { path: 'c.css', status: 'M', added: 1, removed: 0, diff: '@@ -1 +1 @@\n+x' }]
    const md = buildWalkthrough({
      explanation: { groups: [{ title: 'Styles first', why: 'The look.', files: ['c.css', 'a.js'] }, { title: 'Again', files: ['a.js'] }] },
      compared,
      files: three
    })
    const order = ['# Styles first', '## `c.css`', '## `a.js`', '# Everything else', '## `b.json`']
    const positions = order.map((h) => md.indexOf(`\n${h}`))
    expect(positions.every((p) => p > 0)).toBe(true)
    expect([...positions].sort((x, y) => x - y)).toEqual(positions)
    expect(md).toContain('# Styles first\n\nThe look.')
    expect(md).not.toContain('# Again')
  })

  it('keeps agent text from forming headings, fences or other blocks', () => {
    const md = buildWalkthrough({
      explanation: {
        summary: 'Fine.\n## `fake.js`\n```',
        files: { 'a.js': '## `fake.js`', 'b.json': '```js' },
        groups: [{ title: 'Core', why: '# Fake group', files: ['a.js'] }]
      },
      compared,
      files
    })
    const lines = md.split('\n')
    expect(lines.filter((l) => l.startsWith('# '))).toEqual(['# Changes on feature/x', '# Core', '# Everything else'])
    expect(lines.filter((l) => l.startsWith('## '))).toEqual(['## `a.js`', '## `b.json` (new file)'])
    expect(lines.filter((l) => l.startsWith('```'))).toEqual(['````diff a.js', '````', '````diff b.json', '````'])
  })

  it('falls back to a neutral title without an explanation', () => {
    expect(buildWalkthrough({ explanation: {}, compared, files }).startsWith('# Changes on feature/x\n')).toBe(true)
  })
})
