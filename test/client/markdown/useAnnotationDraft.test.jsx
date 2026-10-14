// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useAnnotationDraft } from '../../../client/markdown/src/hooks/useAnnotationDraft.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const note = { id: 'n1', type: 'COMMENT', blockId: 'block-0', originalText: 'Hello' }
const latest = {}
let host
let root

function Harness(props) {
  Object.assign(latest, useAnnotationDraft(props))
  return null
}

function render({ annotations = [], contentHash = 'new', fileId = 'f1', submitted = false } = {}) {
  act(() => root.render(<Harness annotations={annotations} contentHash={contentHash} fileId={fileId} submitted={submitted} />))
}

const draftKeys = () => localStorage.keys().filter((key) => key.startsWith('md-annotator-draft-')).sort()

function seedChangedDraft() {
  const value = JSON.stringify({ annotations: [note], ts: Date.now(), contentHash: 'old' })
  localStorage.setItem('md-annotator-draft-old', value)
  localStorage.setItem('md-annotator-draft-file-f1', value)
}

// jsdom gives an opaque origin no localStorage; a Map stands in for it.
function memoryStorage() {
  const items = new Map()
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)) },
    removeItem: (key) => { items.delete(key) },
    clear: () => items.clear(),
    keys: () => [...items.keys()]
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('useAnnotationDraft', () => {
  it('offers the draft of a changed file and keeps it stored while the banner waits', () => {
    seedChangedDraft()
    render()
    expect(latest.draftBanner.count).toBe(1)
    expect(draftKeys()).toEqual(['md-annotator-draft-file-f1', 'md-annotator-draft-old'])
  })

  it('restores the notes, says the file changed and forgets the old version', () => {
    seedChangedDraft()
    render()
    let restored
    act(() => { restored = latest.restoreDraft() })
    expect(restored).toEqual({ annotations: [note], fileChanged: true })
    expect(latest.draftBanner).toBeNull()
    expect(draftKeys()).toEqual(['md-annotator-draft-file-f1'])
  })

  it('dismissing clears the draft under every key', () => {
    seedChangedDraft()
    render()
    act(() => latest.dismissDraft())
    expect(draftKeys()).toEqual([])
  })

  it('clears the old version too when the review is sent with the banner still open', () => {
    seedChangedDraft()
    render()
    render({ submitted: true })
    expect(draftKeys()).toEqual([])
  })

  it('drops the banner when switching to a file without a draft', () => {
    seedChangedDraft()
    render()
    render({ contentHash: 'other', fileId: 'f2' })
    expect(latest.draftBanner).toBeNull()
  })

  it('reads a draft by content hash alone when there is no file id', () => {
    localStorage.setItem('md-annotator-draft-new', JSON.stringify({ annotations: [note], ts: Date.now(), contentHash: 'new' }))
    render({ fileId: null })
    let restored
    act(() => { restored = latest.restoreDraft() })
    expect(restored).toEqual({ annotations: [note], fileChanged: false })
  })
})
