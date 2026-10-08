import { describe, it, expect } from 'vitest'
import { filesReducer } from '../../../client/markdown/src/state/filesReducer.js'
import { initialAnnotationState } from '../../../client/markdown/src/state/annotationReducer.js'

const makeFile = (overrides = {}) => ({
  path: '/test/file.md',
  content: '# Test',
  blocks: [],
  ...overrides
})

describe('filesReducer', () => {
  describe('INIT_FILES', () => {
    it('initializes files with annotation state', () => {
      const files = [makeFile({ path: '/a.md' }), makeFile({ path: '/b.md' })]
      const state = filesReducer([], { type: 'INIT_FILES', files })
      expect(state).toHaveLength(2)
      expect(state[0].path).toBe('/a.md')
      expect(state[0].annState).toEqual(initialAnnotationState)
      expect(state[1].path).toBe('/b.md')
      expect(state[1].annState).toEqual(initialAnnotationState)
    })

    it('preserves file properties', () => {
      const file = makeFile({ content: '# Hello', blocks: [{ id: 'block-0' }] })
      const state = filesReducer([], { type: 'INIT_FILES', files: [file] })
      expect(state[0].content).toBe('# Hello')
      expect(state[0].blocks).toEqual([{ id: 'block-0' }])
    })
  })

  describe('ADD_FILE', () => {
    it('appends a new file', () => {
      const initial = filesReducer([], { type: 'INIT_FILES', files: [makeFile({ path: '/a.md' })] })
      const state = filesReducer(initial, { type: 'ADD_FILE', file: makeFile({ path: '/b.md' }) })
      expect(state).toHaveLength(2)
      expect(state[1].path).toBe('/b.md')
      expect(state[1].annState).toEqual(initialAnnotationState)
    })
  })

  describe('UPDATE_FILE', () => {
    it('updates file at given index', () => {
      const initial = filesReducer([], {
        type: 'INIT_FILES',
        files: [makeFile({ path: '/a.md' }), makeFile({ path: '/b.md' })]
      })
      const state = filesReducer(initial, {
        type: 'UPDATE_FILE',
        fileIndex: 1,
        updates: { content: '# Updated' }
      })
      expect(state[1].content).toBe('# Updated')
      expect(state[0].content).toBe('# Test')
    })

    it('returns same state for out-of-bounds index (negative)', () => {
      const initial = filesReducer([], { type: 'INIT_FILES', files: [makeFile()] })
      const state = filesReducer(initial, { type: 'UPDATE_FILE', fileIndex: -1, updates: {} })
      expect(state).toBe(initial)
    })

    it('returns same state for out-of-bounds index (too large)', () => {
      const initial = filesReducer([], { type: 'INIT_FILES', files: [makeFile()] })
      const state = filesReducer(initial, { type: 'UPDATE_FILE', fileIndex: 5, updates: {} })
      expect(state).toBe(initial)
    })
  })

  describe('ANN', () => {
    it('dispatches annotation action to correct file', () => {
      const initial = filesReducer([], {
        type: 'INIT_FILES',
        files: [makeFile({ path: '/a.md' }), makeFile({ path: '/b.md' })]
      })
      const ann = { id: 'ann-1', blockId: 'block-0', startOffset: 0, endOffset: 5, type: 'COMMENT', text: 'Test', originalText: 'Hello' }
      const state = filesReducer(initial, {
        type: 'ANN',
        fileIndex: 0,
        annAction: { type: 'ADD', annotation: ann }
      })
      expect(state[0].annState.annotations).toHaveLength(1)
      expect(state[1].annState.annotations).toHaveLength(0)
    })

    it('returns same state for out-of-bounds fileIndex', () => {
      const initial = filesReducer([], { type: 'INIT_FILES', files: [makeFile()] })
      const state = filesReducer(initial, {
        type: 'ANN',
        fileIndex: 99,
        annAction: { type: 'ADD', annotation: {} }
      })
      expect(state).toBe(initial)
    })

    it('returns same state for negative fileIndex', () => {
      const initial = filesReducer([], { type: 'INIT_FILES', files: [makeFile()] })
      const state = filesReducer(initial, {
        type: 'ANN',
        fileIndex: -1,
        annAction: { type: 'ADD', annotation: {} }
      })
      expect(state).toBe(initial)
    })
  })

  describe('ANN numbering', () => {
    const blocks = [{ id: 'block-0', type: 'paragraph', content: 'Hello world', startLine: 1 }, { id: 'block-1', type: 'paragraph', content: 'Later', startLine: 3 }]
    const two = () => filesReducer([], { type: 'INIT_FILES', files: [makeFile({ path: '/a.md', blocks }), makeFile({ path: '/b.md', blocks })] })
    const note = (id, extra = {}) => ({ id, blockId: 'block-0', startOffset: 0, endOffset: 5, type: 'COMMENT', text: id, originalText: 'Hello', ...extra })
    const ann = (state, fileIndex, annAction) => filesReducer(state, { type: 'ANN', fileIndex, annAction })

    it('numbers new notes across files and keeps the gap of a deleted one', () => {
      let state = ann(two(), 0, { type: 'ADD', annotation: note('a') })
      state = ann(state, 1, { type: 'ADD', annotation: note('b', { type: 'DELETION' }) })
      state = ann(state, 0, { type: 'DELETE', id: 'a' })
      state = ann(state, 0, { type: 'ADD', annotation: note('c', { intent: 'question' }) })
      expect(state[1].annState.annotations.map((a) => [a.id, a.number, a.intent])).toEqual([['b', 2, 'remove']])
      expect(state[0].annState.annotations.map((a) => [a.id, a.number, a.intent])).toEqual([['c', 3, 'question']])
    })

    it('leaves a general comment unnumbered', () => {
      const state = ann(two(), 0, { type: 'ADD', annotation: { id: 'g', type: 'COMMENT', targetType: 'global', text: 'overall' } })
      expect(state[0].annState.annotations[0].number).toBeUndefined()
    })

    it('numbers restored notes without numbers in document order, after the other files', () => {
      let state = ann(two(), 1, { type: 'ADD', annotation: note('other') })
      state = ann(state, 0, {
        type: 'RESTORE',
        annotations: [note('late', { blockId: 'block-1' }), note('early', { type: 'DELETION' })]
      })
      expect(state[0].annState.annotations.map((a) => [a.id, a.number, a.intent])).toEqual([['late', 3, 'change'], ['early', 2, 'remove']])
    })
  })

  describe('opened and reviewed', () => {
    const init = (count) => filesReducer([], {
      type: 'INIT_FILES',
      files: Array.from({ length: count }, (_, i) => makeFile({ path: `/${i}.md` }))
    })

    it('starts with the first file opened and nothing reviewed', () => {
      const state = init(3)
      expect(state.map((f) => f.opened)).toEqual([true, false, false])
      expect(state.map((f) => f.reviewed)).toEqual([false, false, false])
    })

    it('marks a file opened once it is shown, and keeps the state when it already is', () => {
      const initial = init(2)
      const state = filesReducer(initial, { type: 'MARK_OPENED', fileIndex: 1 })
      expect(state[1].opened).toBe(true)
      expect(state[1].reviewed).toBe(false)
      expect(filesReducer(state, { type: 'MARK_OPENED', fileIndex: 1 })).toBe(state)
      expect(filesReducer(state, { type: 'MARK_OPENED', fileIndex: 5 })).toBe(state)
    })

    it('marks a file reviewed only when asked, and takes it back', () => {
      const reviewed = filesReducer(init(2), { type: 'SET_REVIEWED', fileIndex: 1, reviewed: true })
      expect(reviewed[1]).toMatchObject({ reviewed: true, opened: true })
      expect(filesReducer(reviewed, { type: 'SET_REVIEWED', fileIndex: 1, reviewed: false })[1].reviewed).toBe(false)
      expect(filesReducer(reviewed, { type: 'SET_REVIEWED', fileIndex: 5, reviewed: true })).toBe(reviewed)
    })

    it('adds a new file neither opened nor reviewed', () => {
      const state = filesReducer(init(1), { type: 'ADD_FILE', file: makeFile({ path: '/b.md' }) })
      expect(state[1]).toMatchObject({ opened: false, reviewed: false })
    })
  })

  describe('unknown action', () => {
    it('returns current state', () => {
      const initial = [makeFile()]
      const state = filesReducer(initial, { type: 'UNKNOWN' })
      expect(state).toBe(initial)
    })
  })
})
