import { describe, it, expect } from 'vitest'
import { annotationReducer, initialAnnotationState } from '../../../client/image/src/state/annotationReducer.js'

const makeAnnotation = (overrides = {}) => ({
  id: 'ann-1',
  type: 'pin',
  geometry: { x: 10, y: 10 },
  text: 'Fix this',
  color: '#e11d48',
  createdAt: 0,
  ...overrides
})

describe('annotationReducer', () => {
  it('has the correct initial shape', () => {
    expect(initialAnnotationState).toEqual({ annotations: [], history: [], redo: [] })
  })

  it('ADD appends an annotation and records history', () => {
    const ann = makeAnnotation()
    const next = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
    expect(next.annotations).toEqual([ann])
    expect(next.history).toEqual([{ action: 'add', annotation: ann }])
    expect(next.redo).toEqual([])
  })

  it('UPDATE merges changes into the matching annotation', () => {
    const state = { annotations: [makeAnnotation()], history: [], redo: [] }
    const next = annotationReducer(state, { type: 'UPDATE', id: 'ann-1', changes: { text: 'Changed' } })
    expect(next.annotations[0].text).toBe('Changed')
    expect(next.annotations[0].geometry).toEqual({ x: 10, y: 10 })
  })

  it('REMOVE drops the matching annotation and records history', () => {
    const ann = makeAnnotation()
    const state = { annotations: [ann], history: [], redo: [] }
    const next = annotationReducer(state, { type: 'REMOVE', id: 'ann-1' })
    expect(next.annotations).toEqual([])
    expect(next.history).toEqual([{ action: 'remove', annotation: ann }])
  })

  it('REMOVE is a no-op for an unknown id', () => {
    const state = { annotations: [makeAnnotation()], history: [], redo: [] }
    const next = annotationReducer(state, { type: 'REMOVE', id: 'does-not-exist' })
    expect(next.annotations).toHaveLength(1)
    expect(next.history).toEqual([])
  })

  it('SET_ALL replaces the annotation list wholesale', () => {
    const state = { annotations: [makeAnnotation()], history: [], redo: [] }
    const next = annotationReducer(state, { type: 'SET_ALL', annotations: [] })
    expect(next.annotations).toEqual([])
  })

  it('SET_ALL clears history and redo, so a restored session cannot undo past the restore', () => {
    const state = { annotations: [], history: [{ action: 'add', annotation: makeAnnotation() }], redo: [{ action: 'add', annotation: makeAnnotation() }] }
    const next = annotationReducer(state, { type: 'SET_ALL', annotations: [makeAnnotation()] })
    expect(next.history).toEqual([])
    expect(next.redo).toEqual([])
  })

  it('returns the same state for an unknown action type', () => {
    expect(annotationReducer(initialAnnotationState, { type: 'NOPE' })).toBe(initialAnnotationState)
  })

  describe('EDIT (a completed move, resize, or popover edit)', () => {
    it('replaces the annotation with `after` and records one history entry, not a per-drag-frame one', () => {
      const before = makeAnnotation({ geometry: { x: 10, y: 10 } })
      const after = { ...before, geometry: { x: 50, y: 60 } }
      const state = { annotations: [before], history: [], redo: [] }
      const next = annotationReducer(state, { type: 'EDIT', id: 'ann-1', before, after })
      expect(next.annotations).toEqual([after])
      expect(next.history).toEqual([{ action: 'edit', id: 'ann-1', before, after }])
      expect(next.redo).toEqual([])
    })
  })

  describe('UNDO / REDO', () => {
    it('undoes an ADD by removing the annotation, and REDO restores it', () => {
      const ann = makeAnnotation()
      const added = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      const undone = annotationReducer(added, { type: 'UNDO' })
      expect(undone.annotations).toEqual([])
      expect(undone.history).toEqual([])
      expect(undone.redo).toHaveLength(1)

      const redone = annotationReducer(undone, { type: 'REDO' })
      expect(redone.annotations).toEqual([ann])
      expect(redone.redo).toEqual([])
    })

    it('undoes a REMOVE by restoring the annotation, and REDO removes it again', () => {
      const ann = makeAnnotation()
      const state = { annotations: [ann], history: [], redo: [] }
      const removed = annotationReducer(state, { type: 'REMOVE', id: 'ann-1' })
      const undone = annotationReducer(removed, { type: 'UNDO' })
      expect(undone.annotations).toEqual([ann])

      const redone = annotationReducer(undone, { type: 'REDO' })
      expect(redone.annotations).toEqual([])
    })

    it('undoes an EDIT (move/resize/style change) by restoring `before`, and REDO reapplies `after`', () => {
      const before = makeAnnotation({ geometry: { x: 10, y: 10 } })
      const after = { ...before, geometry: { x: 99, y: 99 } }
      const state = { annotations: [before], history: [], redo: [] }
      const edited = annotationReducer(state, { type: 'EDIT', id: 'ann-1', before, after })
      const undone = annotationReducer(edited, { type: 'UNDO' })
      expect(undone.annotations).toEqual([before])

      const redone = annotationReducer(undone, { type: 'REDO' })
      expect(redone.annotations).toEqual([after])
    })

    it('UNDO is a no-op when there is no history', () => {
      expect(annotationReducer(initialAnnotationState, { type: 'UNDO' })).toBe(initialAnnotationState)
    })

    it('REDO is a no-op when there is no redo entry', () => {
      expect(annotationReducer(initialAnnotationState, { type: 'REDO' })).toBe(initialAnnotationState)
    })

    it('a new ADD after an UNDO clears the redo stack', () => {
      const ann = makeAnnotation()
      const added = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      const undone = annotationReducer(added, { type: 'UNDO' })
      const readded = annotationReducer(undone, { type: 'ADD', annotation: makeAnnotation({ id: 'ann-2' }) })
      expect(readded.redo).toEqual([])
    })
  })
})
