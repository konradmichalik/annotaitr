import { describe, it, expect } from 'vitest'
import { parseMarkdownToBlocks } from '../../../client/markdown/src/utils/parser.js'
import { changesFacts, groupChangeSections, noteCounts } from '../../../client/markdown/src/utils/changeSections.js'

const walkthrough = [
  '# Scope the cache',
  '',
  'Why it changed.',
  '',
  '**Compared:** uncommitted changes on `main` against `HEAD` (`9b2d4c1`), untracked files included. 3 files, +3 −1.',
  '',
  '## `src/a.js`',
  '',
  'Renames a.',
  '',
  '````diff src/a.js',
  '@@ -1 +1,2 @@',
  '-a',
  '+b',
  '+c',
  '````',
  '',
  '## `docs/new.md` (new file)',
  '',
  'The agent did not mention this change.',
  '',
  '````diff docs/new.md',
  '@@ -0,0 +1 @@',
  '+# New',
  '````',
  '',
  '## `package-lock.json`',
  '',
  'The agent did not mention this change.',
  '',
  '+120 −80, not shown: lock file.',
  ''
].join('\n')

describe('groupChangeSections', () => {
  const { overview, files } = groupChangeSections(parseMarkdownToBlocks(walkthrough))

  it('keeps everything before the first file heading as the overview', () => {
    expect(overview.map((b) => b.type)).toEqual(['heading', 'paragraph', 'paragraph'])
  })

  it('gives each file its path, status and counts, without the heading block', () => {
    expect(files.map(({ path, status, added, removed }) => ({ path, status, added, removed }))).toEqual([
      { path: 'src/a.js', status: 'M', added: 2, removed: 1 },
      { path: 'docs/new.md', status: 'A', added: 1, removed: 0 },
      { path: 'package-lock.json', status: 'M', added: 120, removed: 80 }
    ])
    expect(files[0].blocks.map((b) => b.type)).toEqual(['paragraph', 'code'])
  })

  it('tells explained files from the ones the agent did not mention', () => {
    expect(files.map((f) => f.explained)).toEqual([true, false, false])
  })

  it('reads a deleted file from its heading', () => {
    const { files: deleted } = groupChangeSections(parseMarkdownToBlocks('# T\n\n## `gone.txt` (deleted)\n\nWhy.\n'))
    expect(deleted[0]).toMatchObject({ path: 'gone.txt', status: 'D' })
  })
})

describe('noteCounts', () => {
  it('counts reviewer notes on the overview and per file, not agent notes or general comments', () => {
    const sections = groupChangeSections(parseMarkdownToBlocks(walkthrough))
    const diffBlock = sections.files[0].blocks.find((b) => b.type === 'code')
    const annotations = [
      { blockId: sections.overview[1].id, type: 'COMMENT' },
      { blockId: diffBlock.id, type: 'COMMENT' },
      { blockId: diffBlock.id, type: 'DELETION' },
      { blockId: diffBlock.id, type: 'NOTES' },
      { blockId: '', type: 'COMMENT', targetType: 'global' }
    ]
    const counts = noteCounts(sections, annotations)
    expect(counts.overview).toBe(1)
    expect([...counts.byPath]).toEqual([['src/a.js', 2]])
  })
})

describe('groupChangeSections with groups', () => {
  const grouped = [
    '# Title', '', 'Summary.', '',
    '# Core', '', 'The heart of it.', '',
    '## `src/a.js`', '', 'Renames a.', '',
    '# Everything else', '',
    '## `docs/b.md`', '', 'Docs.', ''
  ].join('\n')
  const { overview, groups, files } = groupChangeSections(parseMarkdownToBlocks(grouped))

  it('keeps the first heading and its text as the overview', () => {
    expect(overview.map((b) => b.content)).toEqual(['Title', 'Summary.'])
  })

  it('collects the files under each group, with the group reason', () => {
    expect(groups.map((g) => [g.title, g.blocks.map((b) => b.content), g.files.map((f) => f.path)])).toEqual([
      ['Core', ['The heart of it.'], ['src/a.js']],
      ['Everything else', [], ['docs/b.md']]
    ])
    expect(files.map((f) => f.path)).toEqual(['src/a.js', 'docs/b.md'])
  })
})

describe('changesFacts', () => {
  it('sums the files and lines for the header', () => {
    expect(changesFacts([{ added: 20, removed: 5 }, { added: 6, removed: 2 }])).toBe('2 files · +26 \u22127')
    expect(changesFacts([{ added: 1, removed: 0 }])).toBe('1 file · +1 \u22120')
  })
})
