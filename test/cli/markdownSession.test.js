import { describe, it, expect } from 'vitest'
import { markdownSessionIdentity, markdownSessionTarget } from '../../cli/markdown.js'
import { changesSessionIdentity } from '../../cli/changes.js'
import { sessionIdFor } from '../../server/core/session/identity.js'

describe('markdownSessionIdentity', () => {
  it('names the whole file set, in any order, apart from an image at the same path', () => {
    expect(markdownSessionIdentity(['/p/b.md', '/p/a.md'])).toBe('markdown\n/p/a.md\n/p/b.md')
    expect(sessionIdFor(markdownSessionIdentity(['/p/a.md', '/p/b.md']))).toBe(sessionIdFor(markdownSessionIdentity(['/p/b.md', '/p/a.md'])))
    expect(sessionIdFor(markdownSessionIdentity(['/p/a.md']))).not.toBe(sessionIdFor('/p/a.md'))
    expect(sessionIdFor(markdownSessionIdentity(['/p/a.md']))).not.toBe(sessionIdFor(markdownSessionIdentity(['/p/a.md', '/p/b.md'])))
  })
})

describe('markdownSessionTarget', () => {
  it('stores each file with its content, and only the hash of a changes walkthrough', () => {
    const files = [{ absolutePath: '/p/a.md', path: 'a.md', content: '# A\n', contentHash: 'h1' }]
    expect(markdownSessionTarget({ kind: 'markdown', label: 'a.md' }, files)).toEqual({
      kind: 'markdown', label: 'a.md', files: [{ path: '/p/a.md', contentHash: 'h1', content: '# A\n' }]
    })
    const changes = { kind: 'changes', label: 'x → main' }
    expect(markdownSessionTarget(changes, files)).toEqual({ ...changes, files: [{ path: '/p/a.md', contentHash: 'h1' }] })
  })
})

describe('changesSessionIdentity', () => {
  it('names the repository, the branch and what it is compared with, never the merge base', () => {
    const base = { branch: 'feature/x', base: 'main', mergeBase: 'aaa', uncommitted: false }
    expect(changesSessionIdentity('/repo', base)).toBe('changes\n/repo\nfeature/x\nmain')
    expect(changesSessionIdentity('/repo', { ...base, mergeBase: 'bbb' })).toBe('changes\n/repo\nfeature/x\nmain')
    expect(changesSessionIdentity('/repo', { branch: 'feature/x', base: 'HEAD', mergeBase: 'aaa', uncommitted: true })).toBe('changes\n/repo\nfeature/x\nuncommitted')
  })
})
