import { describe, it, expect } from 'vitest'
import { readDraft, writeDraft, clearDraft } from '../../../client/markdown/src/utils/draftStorage.js'

function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial))
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)) },
    removeItem: (key) => { items.delete(key) },
    keys: () => [...items.keys()].sort()
  }
}

const ann = { id: 'ann-1', blockId: 'block-0', type: 'COMMENT', originalText: 'Hello' }
const file = { contentHash: 'aaa', fileId: 'f1' }

describe('draft storage', () => {
  it('writes the draft under the content hash and under the file id', () => {
    const storage = memoryStorage()
    writeDraft(storage, file, [ann], 1000)
    expect(storage.keys()).toEqual(['md-annotator-draft-aaa', 'md-annotator-draft-file-f1'])
    expect(JSON.parse(storage.getItem('md-annotator-draft-file-f1'))).toEqual({
      annotations: [ann], ts: 1000, contentHash: 'aaa'
    })
  })

  it('reads the draft of an unchanged file from its hash', () => {
    const storage = memoryStorage()
    writeDraft(storage, file, [ann], 1000)
    expect(readDraft(storage, file)).toEqual({ annotations: [ann], ts: 1000, contentHash: 'aaa', fileChanged: false })
  })

  it('falls back to the file draft when the file changed since', () => {
    const storage = memoryStorage()
    writeDraft(storage, file, [ann], 1000)
    expect(readDraft(storage, { ...file, contentHash: 'bbb' })).toEqual({ annotations: [ann], ts: 1000, contentHash: 'aaa', fileChanged: true })
  })

  it('prefers the hash draft over the file draft', () => {
    const storage = memoryStorage()
    writeDraft(storage, { ...file, contentHash: 'bbb' }, [ann], 1000)
    writeDraft(storage, file, [{ ...ann, id: 'ann-2' }], 2000)
    writeDraft(storage, { ...file, contentHash: 'ccc' }, [{ ...ann, id: 'ann-3' }], 3000)
    expect(readDraft(storage, { ...file, contentHash: 'bbb' })).toEqual({ annotations: [ann], ts: 1000, contentHash: 'bbb', fileChanged: false })
  })

  it('keeps the drafts of other files apart', () => {
    const storage = memoryStorage()
    writeDraft(storage, file, [ann], 1000)
    expect(readDraft(storage, { contentHash: 'zzz', fileId: 'f2' })).toBeNull()
  })

  it('reads a draft stored before file drafts existed', () => {
    const storage = memoryStorage({ 'md-annotator-draft-aaa': JSON.stringify({ annotations: [ann], ts: 5 }) })
    expect(readDraft(storage, file)).toEqual({ annotations: [ann], ts: 5, contentHash: null, fileChanged: false })
  })

  it('ignores empty and corrupted drafts', () => {
    const storage = memoryStorage({
      'md-annotator-draft-aaa': '{not json',
      'md-annotator-draft-file-f1': JSON.stringify({ annotations: [], ts: 5, contentHash: 'old' })
    })
    expect(readDraft(storage, file)).toBeNull()
  })

  it('clears only the hash key of an earlier version when given no file id', () => {
    const storage = memoryStorage()
    writeDraft(storage, { ...file, contentHash: 'old' }, [ann], 1000)
    writeDraft(storage, file, [ann], 2000)
    clearDraft(storage, { contentHash: 'old' })
    expect(storage.keys()).toEqual(['md-annotator-draft-aaa', 'md-annotator-draft-file-f1'])
  })

  it('clears both keys', () => {
    const storage = memoryStorage()
    writeDraft(storage, file, [ann], 1000)
    clearDraft(storage, file)
    expect(storage.keys()).toEqual([])
  })

  it('does nothing without a hash or a file id', () => {
    const storage = memoryStorage()
    writeDraft(storage, { contentHash: null, fileId: null }, [ann], 1000)
    expect(storage.keys()).toEqual([])
    expect(readDraft(storage, { contentHash: null, fileId: null })).toBeNull()
  })

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('full') },
      removeItem: () => { throw new Error('denied') }
    }
    expect(() => writeDraft(broken, file, [ann], 1)).not.toThrow()
    expect(() => clearDraft(broken, file)).not.toThrow()
    expect(readDraft(broken, file)).toBeNull()
  })
})
