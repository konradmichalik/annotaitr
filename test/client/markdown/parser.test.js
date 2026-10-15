import { describe, it, expect } from 'vitest'
import { parseMarkdownToBlocks } from '../../../client/markdown/src/utils/parser.js'

describe('parseMarkdownToBlocks', () => {
  describe('frontmatter', () => {
    it('parses YAML frontmatter at start of document', () => {
      const md = '---\ntitle: Test\nstatus: draft\n---\n\n# Heading'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0]).toMatchObject({
        type: 'frontmatter',
        content: 'title: Test\nstatus: draft',
        startLine: 1
      })
      expect(blocks[0].entries).toEqual([
        { key: 'title', value: 'Test' },
        { key: 'status', value: 'draft' }
      ])
      expect(blocks[1]).toMatchObject({ type: 'heading', content: 'Heading' })
    })

    it('does not parse --- as frontmatter if not at start', () => {
      const md = '# Title\n\n---\nkey: value\n---'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks.find(b => b.type === 'frontmatter')).toBeUndefined()
    })

    it('handles frontmatter with date values', () => {
      const md = '---\ncreated: 2026-03-17\nupdated: 2026-03-17\n---'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].entries).toEqual([
        { key: 'created', value: '2026-03-17' },
        { key: 'updated', value: '2026-03-17' }
      ])
    })

    it('skips lines without colon in frontmatter', () => {
      const md = '---\ntitle: Test\ninvalid line\nstatus: ok\n---'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].entries).toEqual([
        { key: 'title', value: 'Test' },
        { key: 'status', value: 'ok' }
      ])
    })

    it('does not treat empty frontmatter as valid', () => {
      const md = '---\n---\n\n# Heading'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].type).not.toBe('frontmatter')
    })

    it('folds a YAML block scalar into its key value', () => {
      const md = '---\ndescription: |\n  Line one\n  Line two\ntitle: Test\n---'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].entries).toEqual([
        { key: 'description', value: 'Line one Line two' },
        { key: 'title', value: 'Test' }
      ])
    })

    it('folds a YAML list into its key value', () => {
      const md = '---\ntags:\n  - foo\n  - bar\n---'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].entries).toEqual([{ key: 'tags', value: 'foo, bar' }])
    })

    it('does not misparse a colon inside an indented continuation line', () => {
      const md = '---\ndescription: >\n  See https://example.com for details\n---'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].entries).toEqual([
        { key: 'description', value: 'See https://example.com for details' }
      ])
    })

    it('folds a block scalar using a chomping indicator (|-)', () => {
      const md = '---\ndescription: |-\n  Trimmed text\n---'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].entries).toEqual([{ key: 'description', value: 'Trimmed text' }])
    })

    it('folds a block scalar using an explicit indentation indicator (|2)', () => {
      const md = '---\ndescription: |2\n  Indented text\n---'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].entries).toEqual([{ key: 'description', value: 'Indented text' }])
    })

    it('folds a block scalar combining indentation and chomping indicators (|-2, |2-)', () => {
      const md1 = '---\na: |-2\n  x\n---'
      const md2 = '---\na: |2-\n  x\n---'
      expect(parseMarkdownToBlocks(md1)[0].entries).toEqual([{ key: 'a', value: 'x' }])
      expect(parseMarkdownToBlocks(md2)[0].entries).toEqual([{ key: 'a', value: 'x' }])
    })
  })

  describe('headings', () => {
    it('parses h1', () => {
      const blocks = parseMarkdownToBlocks('# Hello')
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({
        type: 'heading',
        content: 'Hello',
        level: 1,
        startLine: 1
      })
    })

    it('parses h2 through h6', () => {
      const md = '## Two\n### Three\n#### Four\n##### Five\n###### Six'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(5)
      expect(blocks.map(b => b.level)).toEqual([2, 3, 4, 5, 6])
      expect(blocks.map(b => b.content)).toEqual(['Two', 'Three', 'Four', 'Five', 'Six'])
    })

    it('strips leading # and whitespace from heading content', () => {
      const blocks = parseMarkdownToBlocks('###   Spaced')
      expect(blocks[0].content).toBe('Spaced')
    })
  })

  describe('paragraphs', () => {
    it('parses a single paragraph', () => {
      const blocks = parseMarkdownToBlocks('Hello world')
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({
        type: 'paragraph',
        content: 'Hello world',
        startLine: 1
      })
    })

    it('merges consecutive lines into one paragraph', () => {
      const blocks = parseMarkdownToBlocks('Line one\nLine two')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toBe('Line one\nLine two')
    })

    it('splits paragraphs on blank lines', () => {
      const blocks = parseMarkdownToBlocks('First para\n\nSecond para')
      expect(blocks).toHaveLength(2)
      expect(blocks[0].content).toBe('First para')
      expect(blocks[1].content).toBe('Second para')
    })

    it('tracks correct startLine for paragraphs', () => {
      const blocks = parseMarkdownToBlocks('First\n\nSecond')
      expect(blocks[0].startLine).toBe(1)
      expect(blocks[1].startLine).toBe(3)
    })
  })

  describe('code blocks', () => {
    it('parses a fenced code block', () => {
      const md = '```\nconst x = 1\n```'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({
        type: 'code',
        content: 'const x = 1',
        startLine: 1
      })
    })

    it('captures language specifier', () => {
      const md = '```javascript\nconst x = 1\n```'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].language).toBe('javascript')
    })

    it('sets language to undefined when not specified', () => {
      const md = '```\ncode\n```'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].language).toBeUndefined()
    })

    it('handles multi-line code blocks', () => {
      const md = '```py\nline1\nline2\nline3\n```'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].content).toBe('line1\nline2\nline3')
      expect(blocks[0].language).toBe('py')
    })

    it('handles empty code blocks', () => {
      const md = '```\n```'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toBe('')
    })

    it('handles nested code fences (4 backticks wrapping 3)', () => {
      const md = '````markdown\n```js\nconst x = 1\n```\n````'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({
        type: 'code',
        language: 'markdown',
        content: '```js\nconst x = 1\n```',
      })
    })

    it('handles deeply nested code fences (5 wrapping 4 wrapping 3)', () => {
      const md = '`````\n````\n```\ninner\n```\n````\n`````'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toBe('````\n```\ninner\n```\n````')
    })

    it('does not close 4-backtick fence with 3 backticks', () => {
      const md = '````\nsome code\n```\nstill code\n````'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toBe('some code\n```\nstill code')
    })

    it('closes fence when closing has more backticks than opening', () => {
      const md = '```\ncode\n`````'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toBe('code')
    })

    it('does not close fence on line with backticks and trailing text', () => {
      const md = '```\n```not-a-close\nactual code\n```'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toBe('```not-a-close\nactual code')
    })

    it('unclosed fence consumes to end of file', () => {
      const md = '````\ncode\n```\nmore code'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toBe('code\n```\nmore code')
    })
  })

  describe('list items', () => {
    it('parses unordered list with -', () => {
      const md = '- Item one\n- Item two'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(2)
      expect(blocks[0]).toMatchObject({ type: 'list-item', content: 'Item one', level: 0 })
      expect(blocks[1]).toMatchObject({ type: 'list-item', content: 'Item two', level: 0 })
    })

    it('parses unordered list with *', () => {
      const md = '* Alpha\n* Beta'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(2)
      expect(blocks[0].content).toBe('Alpha')
    })

    it('parses ordered list', () => {
      const md = '1. First\n2. Second'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(2)
      expect(blocks[0]).toMatchObject({ type: 'list-item', content: 'First' })
      expect(blocks[1]).toMatchObject({ type: 'list-item', content: 'Second' })
    })

    it('detects nested list levels via indentation', () => {
      const md = '- Top\n  - Nested\n    - Deep'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks.map(b => b.level)).toEqual([0, 1, 2])
    })

    it('parses unchecked checkbox', () => {
      const md = '- [ ] Todo'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].checked).toBe(false)
      expect(blocks[0].content).toBe('Todo')
    })

    it('parses checked checkbox', () => {
      const md = '- [x] Done'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].checked).toBe(true)
      expect(blocks[0].content).toBe('Done')
    })

    it('parses uppercase X checkbox', () => {
      const md = '- [X] Also done'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].checked).toBe(true)
    })

    it('leaves checked undefined for non-checkbox items', () => {
      const md = '- Normal item'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].checked).toBeUndefined()
    })

    it('collects indented continuation lines into the list item', () => {
      const md = '- First item\n  with continuation\n- Second item'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(2)
      expect(blocks[0]).toMatchObject({ type: 'list-item', content: 'First item\nwith continuation' })
      expect(blocks[1]).toMatchObject({ type: 'list-item', content: 'Second item' })
    })

    it('collects multiple continuation lines', () => {
      const md = '- Item\n  line two\n  line three\n- Next'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(2)
      expect(blocks[0].content).toBe('Item\nline two\nline three')
    })

    it('does not treat non-indented lines as continuation', () => {
      const md = '- Item\nNot continuation'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(2)
      expect(blocks[0]).toMatchObject({ type: 'list-item', content: 'Item' })
      expect(blocks[1]).toMatchObject({ type: 'paragraph', content: 'Not continuation' })
    })

    it('handles continuation lines in nested list items', () => {
      const md = '- Top\n  - Nested\n    with continuation\n  - Another nested'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(3)
      expect(blocks[1]).toMatchObject({ type: 'list-item', content: 'Nested\nwith continuation', level: 1 })
    })

    it('stops continuation at blank line', () => {
      const md = '- Item\n  continued\n\n- Next item'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(2)
      expect(blocks[0].content).toBe('Item\ncontinued')
    })
  })

  describe('blockquotes', () => {
    it('parses a blockquote', () => {
      const blocks = parseMarkdownToBlocks('> Quote text')
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({
        type: 'blockquote',
        content: 'Quote text',
        startLine: 1
      })
    })

    it('strips > prefix and all leading whitespace', () => {
      const blocks = parseMarkdownToBlocks('>  Spaced quote')
      expect(blocks[0].content).toBe('Spaced quote')
    })

    it('merges consecutive blockquote lines into a single block', () => {
      const md = '> Line one\n> Line two'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toBe('Line one\nLine two')
    })

    it('keeps a quote of plain paragraphs as one block', () => {
      const blocks = parseMarkdownToBlocks('> First\n>\n> Second')
      expect(blocks).toEqual([
        { id: 'block-0', type: 'blockquote', content: 'First\n\nSecond', order: 1, startLine: 1 }
      ])
    })
  })

  describe('blockquotes with nested blocks', () => {
    const issueExample = [
      '> Note:',
      '>',
      '> ```js',
      '> const a = 1',
      '> ```',
      '>',
      '> - one',
      '> - two'
    ].join('\n')

    it('parses a code fence and a list inside a quote into child blocks', () => {
      expect(parseMarkdownToBlocks(issueExample)).toEqual([
        { id: 'block-0', type: 'blockquote', content: '', nested: true, order: 1, startLine: 1 },
        { id: 'block-1', type: 'paragraph', content: 'Note:', level: 0, order: 2, startLine: 1, parentId: 'block-0' },
        { id: 'block-2', type: 'code', content: 'const a = 1', language: 'js', order: 3, startLine: 3, parentId: 'block-0' },
        { id: 'block-3', type: 'list-item', content: 'one', level: 0, checked: undefined, order: 4, startLine: 7, parentId: 'block-0' },
        { id: 'block-4', type: 'list-item', content: 'two', level: 0, checked: undefined, order: 5, startLine: 8, parentId: 'block-0' }
      ])
    })

    it('offsets child lines and ids by what comes before the quote', () => {
      const blocks = parseMarkdownToBlocks('# Title\n\n> - a\n> - b\n\nAfter')
      expect(blocks.map(({ id, type, startLine, parentId }) => ({ id, type, startLine, parentId }))).toEqual([
        { id: 'block-0', type: 'heading', startLine: 1, parentId: undefined },
        { id: 'block-1', type: 'blockquote', startLine: 3, parentId: undefined },
        { id: 'block-2', type: 'list-item', startLine: 3, parentId: 'block-1' },
        { id: 'block-3', type: 'list-item', startLine: 4, parentId: 'block-1' },
        { id: 'block-4', type: 'paragraph', startLine: 6, parentId: undefined }
      ])
    })

    it('parses a nested quote with its own list', () => {
      const blocks = parseMarkdownToBlocks('> Outer\n>\n> > Inner\n> > - x')
      expect(blocks.map(({ id, type, content, startLine, parentId, nested }) => ({ id, type, content, startLine, parentId, nested }))).toEqual([
        { id: 'block-0', type: 'blockquote', content: '', startLine: 1, parentId: undefined, nested: true },
        { id: 'block-1', type: 'paragraph', content: 'Outer', startLine: 1, parentId: 'block-0', nested: undefined },
        { id: 'block-2', type: 'blockquote', content: '', startLine: 3, parentId: 'block-0', nested: true },
        { id: 'block-3', type: 'paragraph', content: 'Inner', startLine: 3, parentId: 'block-2', nested: undefined },
        { id: 'block-4', type: 'list-item', content: 'x', startLine: 4, parentId: 'block-2', nested: undefined }
      ])
    })

    it('keeps the indentation of quoted code and nested list items', () => {
      const blocks = parseMarkdownToBlocks('> ```\n>     indented\n> ```\n> - a\n>   - b')
      expect(blocks[1]).toMatchObject({ type: 'code', content: '    indented', startLine: 1 })
      expect(blocks[3]).toMatchObject({ type: 'list-item', content: 'b', level: 1, startLine: 5 })
    })

    it('parses a list inside a GitHub alert', () => {
      const blocks = parseMarkdownToBlocks('Intro\n\n> [!NOTE]\n> Remember:\n> - one\n> - two')
      expect(blocks.map(({ id, type, alertType, content, startLine, parentId }) => ({ id, type, alertType, content, startLine, parentId }))).toEqual([
        { id: 'block-0', type: 'paragraph', alertType: undefined, content: 'Intro', startLine: 1, parentId: undefined },
        { id: 'block-1', type: 'alert', alertType: 'note', content: '', startLine: 3, parentId: undefined },
        { id: 'block-2', type: 'paragraph', alertType: undefined, content: 'Remember:', startLine: 4, parentId: 'block-1' },
        { id: 'block-3', type: 'list-item', alertType: undefined, content: 'one', startLine: 5, parentId: 'block-1' },
        { id: 'block-4', type: 'list-item', alertType: undefined, content: 'two', startLine: 6, parentId: 'block-1' }
      ])
      expect(blocks[1].nested).toBe(true)
    })

    it('links the children of a quote inside an HTML wrapper to the rebased quote id', () => {
      const blocks = parseMarkdownToBlocks('<div>\n\n> - a\n\n</div>')
      expect(blocks.map(({ id, type, startLine, parentId }) => ({ id, type, startLine, parentId }))).toEqual([
        { id: 'block-0', type: 'html', startLine: 1, parentId: undefined },
        { id: 'block-1', type: 'blockquote', startLine: 3, parentId: undefined },
        { id: 'block-2', type: 'list-item', startLine: 3, parentId: 'block-1' },
        { id: 'block-3', type: 'html', startLine: 5, parentId: undefined }
      ])
    })

    it('keeps the ids before a nested quote when the content after it changes', () => {
      const before = parseMarkdownToBlocks(`Intro\n\n${issueExample}\n\nAfter`)
      const after = parseMarkdownToBlocks(`Intro\n\n${issueExample}\n\n- changed\n- tail`)
      expect(after.slice(0, 6).map((b) => [b.id, b.type, b.startLine])).toEqual(before.slice(0, 6).map((b) => [b.id, b.type, b.startLine]))
      expect(after.slice(0, 6).map((b) => b.id)).toEqual(['block-0', 'block-1', 'block-2', 'block-3', 'block-4', 'block-5'])
    })

    it('gives unique ids to a quote nested in an alert inside an accordion', () => {
      const md = '<details>\n<summary>More</summary>\n\n> [!TIP]\n> > - deep\n> > - deeper\n\n</details>\n\nEnd'
      const ids = parseMarkdownToBlocks(md).map((b) => b.id)
      expect(ids).toEqual(['block-0', 'block-1', 'block-2', 'block-3', 'block-4', 'block-5', 'block-6', 'block-7'])
    })

    it('strips a tab after > from quoted code', () => {
      const blocks = parseMarkdownToBlocks('> ```\n>\tcode\n> ```')
      expect(blocks[1]).toMatchObject({ type: 'code', content: 'code' })
    })

    it('keeps a quote flat when its text only looks like a table, heading or ordered item', () => {
      expect(parseMarkdownToBlocks('> Run `ls | grep x` first')).toEqual([
        { id: 'block-0', type: 'blockquote', content: 'Run `ls | grep x` first', order: 1, startLine: 1 }
      ])
      expect(parseMarkdownToBlocks('> #123 was fixed')).toEqual([
        { id: 'block-0', type: 'blockquote', content: '#123 was fixed', order: 1, startLine: 1 }
      ])
      expect(parseMarkdownToBlocks('> 2024. was good')).toEqual([
        { id: 'block-0', type: 'blockquote', content: '2024. was good', order: 1, startLine: 1 }
      ])
    })

    it('nests a quote with a single bullet item', () => {
      expect(parseMarkdownToBlocks('> - one')[0]).toMatchObject({ type: 'blockquote', nested: true })
    })
  })

  describe('GitHub alert boxes', () => {
    it('parses > [!NOTE] as alert block', () => {
      const md = '> [!NOTE]\n> This is a note.'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({
        type: 'alert',
        alertType: 'note',
        content: 'This is a note.'
      })
    })

    it('parses all five alert types', () => {
      for (const type of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
        const blocks = parseMarkdownToBlocks(`> [!${type}]\n> Text`)
        expect(blocks[0].type).toBe('alert')
        expect(blocks[0].alertType).toBe(type.toLowerCase())
      }
    })

    it('collects multi-line alert content', () => {
      const md = '> [!WARNING]\n> Line one\n> Line two'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].content).toBe('Line one\nLine two')
    })

    it('starts a plain alert on its first line of text, not on the marker', () => {
      const blocks = parseMarkdownToBlocks('Intro\n\n> [!NOTE]\n> Text')
      expect(blocks[1]).toMatchObject({ type: 'alert', content: 'Text', startLine: 4 })
    })

    it('keeps an empty alert on its marker line', () => {
      expect(parseMarkdownToBlocks('> [!NOTE]')[0]).toMatchObject({ type: 'alert', content: '', startLine: 1 })
    })

    it('does not treat unknown types as alerts', () => {
      const md = '> [!UNKNOWN]\n> Some text'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].type).toBe('blockquote')
    })
  })

  describe('horizontal rules', () => {
    it('parses --- as hr', () => {
      const blocks = parseMarkdownToBlocks('---')
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({ type: 'hr', content: '' })
    })

    it('parses *** as hr', () => {
      const blocks = parseMarkdownToBlocks('***')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('hr')
    })
  })

  describe('tables', () => {
    it('parses a simple table', () => {
      const md = '| A | B |\n| --- | --- |\n| 1 | 2 |'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({
        type: 'table',
        content: md,
        startLine: 1
      })
    })

    it('collects all consecutive table rows', () => {
      const md = '| H1 | H2 |\n| - | - |\n| a | b |\n| c | d |'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].content.split('\n')).toHaveLength(4)
    })
  })

  describe('html blocks', () => {
    it('treats inline void tags as paragraphs', () => {
      const blocks = parseMarkdownToBlocks('<br/>')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('paragraph')
    })

    it('parses a block-level void element', () => {
      const blocks = parseMarkdownToBlocks('<hr>')
      expect(blocks[0].type).toBe('html')
    })

    it('parses a multi-line div block as mixed content', () => {
      const md = '<div align="center">\n  <p>Hello</p>\n</div>'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(3)
      expect(blocks[0]).toMatchObject({ type: 'html', content: '<div align="center">', startLine: 1 })
      expect(blocks[1]).toMatchObject({ type: 'html', content: '  <p>Hello</p>' })
      expect(blocks[2]).toMatchObject({ type: 'html', content: '</div>' })
    })

    it('parses a details/summary block as mixed content', () => {
      const md = '<details>\n<summary>Click me</summary>\nHidden content\n</details>'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(4)
      expect(blocks[0]).toMatchObject({ type: 'html', content: '<details>', htmlTag: 'details', htmlRole: 'open' })
      expect(blocks[1]).toMatchObject({ type: 'html', content: 'Click me', htmlTag: 'summary', htmlRole: 'summary' })
      expect(blocks[2]).toMatchObject({ type: 'paragraph', content: 'Hidden content' })
      expect(blocks[3]).toMatchObject({ type: 'html', content: '</details>', htmlTag: 'details', htmlRole: 'close' })
    })

    it('marks a mixed-content wrapper with open and close roles', () => {
      const blocks = parseMarkdownToBlocks('<div align="center">\n  <p>Hello</p>\n</div>')
      expect(blocks[0]).toMatchObject({ htmlTag: 'div', htmlRole: 'open' })
      expect(blocks[2]).toMatchObject({ htmlTag: 'div', htmlRole: 'close' })
    })

    it('leaves an unclosed wrapper without open/close roles', () => {
      const blocks = parseMarkdownToBlocks('<details>\n<summary>Click me</summary>\nHidden content')
      expect(blocks[0].htmlRole).toBeUndefined()
    })

    it('splits a summary that shares the opening details line', () => {
      const md = '<details><summary>Click me</summary>\n\nHidden content\n\n</details>'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0]).toMatchObject({ type: 'html', content: '<details>', htmlRole: 'open' })
      expect(blocks[1]).toMatchObject({ type: 'html', content: 'Click me', htmlRole: 'summary' })
      expect(blocks[2]).toMatchObject({ type: 'paragraph', content: 'Hidden content' })
      expect(blocks[3]).toMatchObject({ type: 'html', content: '</details>', htmlRole: 'close' })
    })

    it('keeps the open attributes on the details marker', () => {
      const blocks = parseMarkdownToBlocks('<details open>\n<summary>S</summary>\nBody\n</details>')
      expect(blocks[0]).toMatchObject({ type: 'html', content: '<details open>', htmlRole: 'open' })
    })

    it('keeps content that follows the closing tag', () => {
      const blocks = parseMarkdownToBlocks('<details>\n<summary>S</summary>\nBody\n</details>After the accordion.')
      expect(blocks[3]).toMatchObject({ type: 'html', content: '</details>', htmlRole: 'close', startLine: 4 })
      expect(blocks[4]).toMatchObject({ type: 'paragraph', content: 'After the accordion.', startLine: 4 })
    })

    it('parses content that precedes the closing tag as markdown', () => {
      const blocks = parseMarkdownToBlocks('<details>\n<summary>S</summary>\nHidden **content**</details>')
      expect(blocks[2]).toMatchObject({ type: 'paragraph', content: 'Hidden **content**' })
      expect(blocks[3]).toMatchObject({ type: 'html', content: '</details>', htmlRole: 'close' })
    })

    it('parses a picture element', () => {
      const md = '<picture>\n  <source srcset="img.webp">\n  <img src="img.png" alt="test">\n</picture>'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('html')
    })

    it('parses a single-line HTML comment', () => {
      const blocks = parseMarkdownToBlocks('<!-- comment -->')
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({ type: 'html', content: '<!-- comment -->', startLine: 1 })
    })

    it('parses a multi-line HTML comment', () => {
      const md = '<!--\nMulti-line\ncomment\n-->'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('html')
      expect(blocks[0].content).toContain('-->')
    })

    it('parses a same-line open/close tag', () => {
      const md = '<p align="center">Centered text</p>'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({ type: 'html', content: md })
    })

    it('handles HTML block between paragraphs', () => {
      const md = 'Before\n\n<div>Block</div>\n\nAfter'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(3)
      expect(blocks[0].type).toBe('paragraph')
      expect(blocks[1].type).toBe('html')
      expect(blocks[2].type).toBe('paragraph')
    })

    it('does not affect HTML inside code blocks', () => {
      const md = '```html\n<div>Not an HTML block</div>\n```'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('code')
      expect(blocks[0].content).toBe('<div>Not an HTML block</div>')
    })

    it('tracks line numbers correctly through HTML blocks', () => {
      const md = '# Title\n\n<div>\n  Content\n</div>\n\nAfter'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].startLine).toBe(1)  // # Title
      expect(blocks[1].startLine).toBe(3)  // <div>
      expect(blocks[2].startLine).toBe(4)  // Content (rebased: 3 + 1)
      expect(blocks[3].startLine).toBe(5)  // </div>
      expect(blocks[4].startLine).toBe(7)  // After
    })

    it('parses nested same-name HTML tags as mixed content', () => {
      const md = '<div>\n  <div>inner</div>\n</div>'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(3)
      expect(blocks[0]).toMatchObject({ type: 'html', content: '<div>' })
      expect(blocks[1]).toMatchObject({ type: 'html', content: '  <div>inner</div>' })
      expect(blocks[2]).toMatchObject({ type: 'html', content: '</div>' })
    })
  })

  describe('mixed content', () => {
    it('parses heading followed by paragraph', () => {
      const md = '# Title\n\nSome text here.'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks).toHaveLength(2)
      expect(blocks[0].type).toBe('heading')
      expect(blocks[1].type).toBe('paragraph')
    })

    it('parses a complex document', () => {
      const md = [
        '# Heading',
        '',
        'Paragraph text.',
        '',
        '- List item 1',
        '- List item 2',
        '',
        '```js',
        'const x = 1',
        '```',
        '',
        '> A quote',
        '',
        '---',
        '',
        '| Col | Col |',
        '| --- | --- |',
        '| A   | B   |'
      ].join('\n')

      const blocks = parseMarkdownToBlocks(md)
      const types = blocks.map(b => b.type)
      expect(types).toEqual([
        'heading', 'paragraph', 'list-item', 'list-item',
        'code', 'blockquote', 'hr', 'table'
      ])
    })

    it('tracks line numbers correctly through mixed content', () => {
      const md = '# Title\n\nParagraph\n\n```\ncode\n```\n\n> Quote'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].startLine).toBe(1)  // heading
      expect(blocks[1].startLine).toBe(3)  // paragraph
      expect(blocks[2].startLine).toBe(5)  // code
      expect(blocks[3].startLine).toBe(9)  // quote
    })
  })

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      expect(parseMarkdownToBlocks('')).toEqual([])
    })

    it('returns empty array for whitespace-only input', () => {
      expect(parseMarkdownToBlocks('   \n\n   ')).toEqual([])
    })

    it('assigns unique sequential ids', () => {
      const md = '# A\n\nText\n\n- Item'
      const blocks = parseMarkdownToBlocks(md)
      const ids = blocks.map(b => b.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toEqual(['block-0', 'block-1', 'block-2'])
    })

    it('assigns sequential order values', () => {
      const md = '# A\n\nText'
      const blocks = parseMarkdownToBlocks(md)
      expect(blocks[0].order).toBeLessThan(blocks[1].order)
    })
  })
})
