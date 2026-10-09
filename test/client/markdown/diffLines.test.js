import { describe, it, expect } from 'vitest'
import { parseDiffLines, countDiffLines, splitCodeInfo } from '../../../client/markdown/src/utils/diffLines.js'

describe('parseDiffLines', () => {
  it('numbers old and new lines from the hunk header', () => {
    const lines = parseDiffLines('@@ -41,3 +41,3 @@ fn()\n a\n-b\n+c\n d')
    expect(lines).toEqual([
      { kind: 'hunk', text: '@@ -41,3 +41,3 @@ fn()', oldNo: null, newNo: null },
      { kind: 'context', text: ' a', oldNo: 41, newNo: 41 },
      { kind: 'del', text: '-b', oldNo: 42, newNo: null },
      { kind: 'add', text: '+c', oldNo: null, newNo: 42 },
      { kind: 'context', text: ' d', oldNo: 43, newNo: 43 }
    ])
  })

  it('restarts the numbers at every hunk', () => {
    const lines = parseDiffLines('@@ -1 +1 @@\n-a\n+b\n@@ -10,1 +10,2 @@\n c\n+d')
    expect(lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ['hunk', null, null], ['del', 1, null], ['add', null, 1],
      ['hunk', null, null], ['context', 10, 10], ['add', null, 11]
    ])
  })

  it('treats file headers and the no-newline marker as meta lines without numbers', () => {
    const lines = parseDiffLines('--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b')
    expect(lines.map((l) => l.kind)).toEqual(['meta', 'meta', 'hunk', 'del', 'meta', 'add'])
  })

  it('numbers nothing before the first hunk header', () => {
    expect(parseDiffLines('+a\n b')).toEqual([
      { kind: 'add', text: '+a', oldNo: null, newNo: null },
      { kind: 'context', text: ' b', oldNo: null, newNo: null }
    ])
  })
})

describe('countDiffLines', () => {
  it('counts added and removed lines, not the file headers', () => {
    expect(countDiffLines(parseDiffLines('--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-a\n+b\n+c\n d'))).toEqual({ added: 2, removed: 1 })
  })
})

describe('splitCodeInfo', () => {
  it('splits a fence info string into language and the rest', () => {
    expect(splitCodeInfo('diff src/Foo.php')).toEqual({ language: 'diff', meta: 'src/Foo.php' })
    expect(splitCodeInfo('js')).toEqual({ language: 'js', meta: '' })
    expect(splitCodeInfo(undefined)).toEqual({ language: '', meta: '' })
  })
})
