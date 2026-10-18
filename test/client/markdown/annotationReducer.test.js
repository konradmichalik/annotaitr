import { describe, it, expect } from 'vitest'
import { annotationReducer, initialAnnotationState } from '../../../client/markdown/src/state/annotationReducer.js'

const makeAnnotation = (overrides = {}) => ({
  id: 'ann-1',
  blockId: 'block-0',
  startOffset: 0,
  endOffset: 5,
  type: 'COMMENT',
  text: 'Fix this',
  originalText: 'Hello',
  ...overrides
})

describe('annotationReducer', () => {
  describe('initial state', () => {
    it('has correct shape', () => {
      expect(initialAnnotationState).toEqual({
        annotations: [],
        history: [],
        redo: [],
        lastAction: null
      })
    })
  })

  describe('ADD', () => {
    it('adds an annotation', () => {
      const ann = makeAnnotation()
      const next = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      expect(next.annotations).toHaveLength(1)
      expect(next.annotations[0]).toBe(ann)
    })

    it('records history entry', () => {
      const ann = makeAnnotation()
      const next = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      expect(next.history).toHaveLength(1)
      expect(next.history[0]).toEqual({ action: 'add', annotation: ann })
    })

    it('clears redo stack', () => {
      const state = { ...initialAnnotationState, redo: [{ action: 'add', annotation: makeAnnotation() }] }
      const next = annotationReducer(state, { type: 'ADD', annotation: makeAnnotation({ id: 'ann-2' }) })
      expect(next.redo).toEqual([])
    })

    it('sets lastAction', () => {
      const ann = makeAnnotation()
      const next = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      expect(next.lastAction).toEqual({ type: 'add', annotation: ann })
    })
  })

  describe('DELETE', () => {
    it('removes an existing annotation', () => {
      const ann = makeAnnotation()
      const state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      const next = annotationReducer(state, { type: 'DELETE', id: 'ann-1' })
      expect(next.annotations).toHaveLength(0)
    })

    it('returns same state when id not found', () => {
      const ann = makeAnnotation()
      const state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      const next = annotationReducer(state, { type: 'DELETE', id: 'nonexistent' })
      expect(next).toBe(state)
    })

    it('records deleted annotation in history', () => {
      const ann = makeAnnotation()
      const state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      const next = annotationReducer(state, { type: 'DELETE', id: 'ann-1' })
      expect(next.history[1]).toEqual({ action: 'delete', annotation: ann })
    })
  })

  describe('EDIT', () => {
    it('replaces the attached images when the edit carries them, and keeps them otherwise', () => {
      const shot = { id: 'a.png', path: '/tmp/a.png', name: 'a.png' }
      const state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: makeAnnotation({ attachments: [shot] }) })
      const kept = annotationReducer(state, { type: 'EDIT', id: 'ann-1', annotationType: 'COMMENT', text: 'New' })
      expect(kept.annotations[0].attachments).toEqual([shot])
      const cleared = annotationReducer(state, { type: 'EDIT', id: 'ann-1', annotationType: 'COMMENT', text: 'New', attachments: [] })
      expect(cleared.annotations[0].attachments).toEqual([])
    })

    it('updates annotation type and text', () => {
      const ann = makeAnnotation()
      const state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      const next = annotationReducer(state, {
        type: 'EDIT',
        id: 'ann-1',
        annotationType: 'DELETION',
        text: null
      })
      expect(next.annotations[0].type).toBe('DELETION')
      expect(next.annotations[0].text).toBeNull()
    })

    it('preserves other annotation fields', () => {
      const ann = makeAnnotation()
      const state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      const next = annotationReducer(state, {
        type: 'EDIT',
        id: 'ann-1',
        annotationType: 'DELETION',
        text: null
      })
      expect(next.annotations[0].blockId).toBe('block-0')
      expect(next.annotations[0].originalText).toBe('Hello')
    })

    it('adds label when provided', () => {
      const ann = makeAnnotation()
      const label = { id: 'unclear', emoji: '\u2753', text: 'Unclear', color: 'yellow' }
      const state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      const next = annotationReducer(state, {
        type: 'EDIT',
        id: 'ann-1',
        annotationType: 'COMMENT',
        text: '\u2753 Unclear',
        label
      })
      expect(next.annotations[0].label).toEqual(label)
    })

    it('does not overwrite label when not provided in edit', () => {
      const label = { id: 'unclear', emoji: '\u2753', text: 'Unclear', color: 'yellow' }
      const ann = makeAnnotation({ label })
      const state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      const next = annotationReducer(state, {
        type: 'EDIT',
        id: 'ann-1',
        annotationType: 'COMMENT',
        text: 'Updated text'
      })
      expect(next.annotations[0].label).toEqual(label)
    })

    it('returns same state when id not found', () => {
      const state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: makeAnnotation() })
      const next = annotationReducer(state, {
        type: 'EDIT',
        id: 'nonexistent',
        annotationType: 'DELETION',
        text: null
      })
      expect(next).toBe(state)
    })

    it('records original and updated in history', () => {
      const ann = makeAnnotation()
      const state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      const next = annotationReducer(state, {
        type: 'EDIT',
        id: 'ann-1',
        annotationType: 'DELETION',
        text: null
      })
      expect(next.history[1].action).toBe('edit')
      expect(next.history[1].annotation).toBe(ann)
      expect(next.history[1].updated.type).toBe('DELETION')
    })
  })

  describe('UNDO', () => {
    it('returns same state when history is empty', () => {
      const next = annotationReducer(initialAnnotationState, { type: 'UNDO' })
      expect(next).toBe(initialAnnotationState)
    })

    it('undoes ADD by removing annotation', () => {
      const ann = makeAnnotation()
      const added = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      const undone = annotationReducer(added, { type: 'UNDO' })
      expect(undone.annotations).toHaveLength(0)
    })

    it('undoes DELETE by restoring annotation', () => {
      const ann = makeAnnotation()
      let state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      state = annotationReducer(state, { type: 'DELETE', id: 'ann-1' })
      const undone = annotationReducer(state, { type: 'UNDO' })
      expect(undone.annotations).toHaveLength(1)
      expect(undone.annotations[0].id).toBe('ann-1')
    })

    it('undoes EDIT by restoring original', () => {
      const ann = makeAnnotation()
      let state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      state = annotationReducer(state, {
        type: 'EDIT',
        id: 'ann-1',
        annotationType: 'DELETION',
        text: null
      })
      const undone = annotationReducer(state, { type: 'UNDO' })
      expect(undone.annotations[0].type).toBe('COMMENT')
      expect(undone.annotations[0].text).toBe('Fix this')
    })

    it('moves entry to redo stack', () => {
      const ann = makeAnnotation()
      const added = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      const undone = annotationReducer(added, { type: 'UNDO' })
      expect(undone.redo).toHaveLength(1)
      expect(undone.history).toHaveLength(0)
    })
  })

  describe('REDO', () => {
    it('returns same state when redo stack is empty', () => {
      const next = annotationReducer(initialAnnotationState, { type: 'REDO' })
      expect(next).toBe(initialAnnotationState)
    })

    it('redoes an undone ADD', () => {
      const ann = makeAnnotation()
      let state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      state = annotationReducer(state, { type: 'UNDO' })
      const redone = annotationReducer(state, { type: 'REDO' })
      expect(redone.annotations).toHaveLength(1)
      expect(redone.annotations[0].id).toBe('ann-1')
    })

    it('redoes an undone DELETE', () => {
      const ann = makeAnnotation()
      let state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      state = annotationReducer(state, { type: 'DELETE', id: 'ann-1' })
      state = annotationReducer(state, { type: 'UNDO' })
      const redone = annotationReducer(state, { type: 'REDO' })
      expect(redone.annotations).toHaveLength(0)
    })

    it('redoes an undone EDIT', () => {
      const ann = makeAnnotation()
      let state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      state = annotationReducer(state, {
        type: 'EDIT',
        id: 'ann-1',
        annotationType: 'DELETION',
        text: null
      })
      state = annotationReducer(state, { type: 'UNDO' })
      const redone = annotationReducer(state, { type: 'REDO' })
      expect(redone.annotations[0].type).toBe('DELETION')
    })

    it('moves entry back to history', () => {
      const ann = makeAnnotation()
      let state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann })
      state = annotationReducer(state, { type: 'UNDO' })
      const redone = annotationReducer(state, { type: 'REDO' })
      expect(redone.history).toHaveLength(1)
      expect(redone.redo).toHaveLength(0)
    })
  })

  describe('UNDO/REDO sequences', () => {
    it('supports multiple undo steps', () => {
      const ann1 = makeAnnotation({ id: 'ann-1' })
      const ann2 = makeAnnotation({ id: 'ann-2' })
      let state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann1 })
      state = annotationReducer(state, { type: 'ADD', annotation: ann2 })
      state = annotationReducer(state, { type: 'UNDO' })
      expect(state.annotations).toHaveLength(1)
      state = annotationReducer(state, { type: 'UNDO' })
      expect(state.annotations).toHaveLength(0)
    })

    it('new action clears redo stack', () => {
      const ann1 = makeAnnotation({ id: 'ann-1' })
      const ann2 = makeAnnotation({ id: 'ann-2' })
      let state = annotationReducer(initialAnnotationState, { type: 'ADD', annotation: ann1 })
      state = annotationReducer(state, { type: 'UNDO' })
      expect(state.redo).toHaveLength(1)
      state = annotationReducer(state, { type: 'ADD', annotation: ann2 })
      expect(state.redo).toHaveLength(0)
    })
  })

  describe('RESTORE', () => {
    it('replaces all state with given annotations', () => {
      const anns = [makeAnnotation({ id: 'ann-1' }), makeAnnotation({ id: 'ann-2' })]
      const next = annotationReducer(initialAnnotationState, { type: 'RESTORE', annotations: anns })
      expect(next.annotations).toEqual(anns)
      expect(next.history).toEqual([])
      expect(next.redo).toEqual([])
      expect(next.lastAction).toBeNull()
    })
  })

  describe('unknown action', () => {
    it('returns current state', () => {
      const next = annotationReducer(initialAnnotationState, { type: 'UNKNOWN' })
      expect(next).toBe(initialAnnotationState)
    })
  })

  describe('immutability', () => {
    it('does not mutate state on ADD', () => {
      const state = { ...initialAnnotationState }
      const frozen = Object.freeze(state)
      expect(() => annotationReducer(frozen, { type: 'ADD', annotation: makeAnnotation() })).not.toThrow()
    })
  })
})
