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
    const numbered = { ...ann, intent: 'question', number: 1 }
    expect(next.annotations).toEqual([numbered])
    expect(next.history).toEqual([{ action: 'add', annotation: numbered }])
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
      expect(redone.annotations).toEqual([{ ...ann, intent: 'question', number: 1 }])
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

  describe('intent and stable numbers', () => {
    const add = (state, annotation) => annotationReducer(state, { type: 'ADD', annotation })

    it('numbers new notes in the order they are added and gives them the default intent', () => {
      let state = add(initialAnnotationState, makeAnnotation({ id: 'a', type: 'box', geometry: { x: 0, y: 0, width: 5, height: 5 } }))
      state = add(state, makeAnnotation({ id: 'b' }))
      expect(state.annotations.map((a) => [a.id, a.number, a.intent])).toEqual([['a', 1, 'change'], ['b', 2, 'question']])
    })

    it('keeps the intent the composer picked', () => {
      const state = add(initialAnnotationState, makeAnnotation({ intent: 'remove' }))
      expect(state.annotations[0].intent).toBe('remove')
    })

    it('never renumbers after a delete and never hands out a deleted number again', () => {
      let state = add(initialAnnotationState, makeAnnotation({ id: 'a' }))
      state = add(state, makeAnnotation({ id: 'b' }))
      state = add(state, makeAnnotation({ id: 'c' }))
      state = annotationReducer(state, { type: 'REMOVE', id: 'b' })
      state = annotationReducer(state, { type: 'REMOVE', id: 'c' })
      expect(state.annotations.map((a) => a.number)).toEqual([1])
      state = add(state, makeAnnotation({ id: 'd' }))
      expect(state.annotations.map((a) => a.number)).toEqual([1, 4])
      state = annotationReducer(annotationReducer(state, { type: 'UNDO' }), { type: 'UNDO' })
      expect(state.annotations.map((a) => [a.id, a.number])).toEqual([['a', 1], ['c', 3]])
    })

    it('leaves the general comment unnumbered', () => {
      const state = add(initialAnnotationState, { id: 'g', type: 'comment', geometry: null, text: 'overall' })
      expect(state.annotations[0].number).toBeUndefined()
    })

    it('gives loaded data without intent or number both, in the order the mode numbered it before', () => {
      const byTime = (list) => [...list].sort((a, b) => a.time - b.time)
      const state = annotationReducer(initialAnnotationState, {
        type: 'SET_ALL',
        order: byTime,
        annotations: [
          makeAnnotation({ id: 'late', time: 4 }),
          makeAnnotation({ id: 'early', type: 'box', time: 1 })
        ]
      })
      expect(state.annotations.map((a) => [a.id, a.number, a.intent])).toEqual([['late', 2, 'question'], ['early', 1, 'change']])
    })
  })
})
