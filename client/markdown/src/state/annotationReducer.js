import { defaultIntent } from '../../../shared/utils/intents.js'

export const initialAnnotationState = {
  annotations: [],
  history: [],
  redo: [],
  lastAction: null
}

export function annotationReducer(state, action) {
  switch (action.type) {
    case 'ADD': {
      return {
        annotations: [...state.annotations, action.annotation],
        history: [...state.history, { action: 'add', annotation: action.annotation }],
        redo: [],
        lastAction: { type: 'add', annotation: action.annotation }
      }
    }
    case 'DELETE': {
      const deleted = state.annotations.find(a => a.id === action.id)
      if (!deleted) {return state}
      return {
        annotations: state.annotations.filter(a => a.id !== action.id),
        history: [...state.history, { action: 'delete', annotation: deleted }],
        redo: [],
        lastAction: { type: 'delete', annotation: deleted }
      }
    }
    case 'EDIT': {
      const original = state.annotations.find(a => a.id === action.id)
      if (!original) {return state}
      const updated = { ...original, type: action.annotationType, text: action.text }
      if (action.label !== undefined) { updated.label = action.label }
      // A note that changes type (a deletion turned into a comment) takes the new type's intent unless one was picked.
      if (action.intent !== undefined) { updated.intent = action.intent }
      else if (action.annotationType !== original.type) { updated.intent = defaultIntent(action.annotationType) }
      return {
        annotations: state.annotations.map(a => a.id === action.id ? updated : a),
        history: [...state.history, { action: 'edit', annotation: original, updated }],
        redo: [],
        lastAction: { type: 'edit', annotation: original, updated }
      }
    }
    case 'UNDO': {
      if (state.history.length === 0) {return state}
      const entry = state.history[state.history.length - 1]
      let newAnnotations = state.annotations
      if (entry.action === 'add') {
        newAnnotations = state.annotations.filter(a => a.id !== entry.annotation.id)
      } else if (entry.action === 'delete') {
        newAnnotations = [...state.annotations, entry.annotation]
      } else if (entry.action === 'edit') {
        newAnnotations = state.annotations.map(a => a.id === entry.updated.id ? entry.annotation : a)
      }
      return {
        annotations: newAnnotations,
        history: state.history.slice(0, -1),
        redo: [...state.redo, entry],
        lastAction: { type: 'undo', entry }
      }
    }
    case 'REDO': {
      if (state.redo.length === 0) {return state}
      const entry = state.redo[state.redo.length - 1]
      let newAnnotations = state.annotations
      if (entry.action === 'add') {
        newAnnotations = [...state.annotations, entry.annotation]
      } else if (entry.action === 'delete') {
        newAnnotations = state.annotations.filter(a => a.id !== entry.annotation.id)
      } else if (entry.action === 'edit') {
        newAnnotations = state.annotations.map(a => a.id === entry.annotation.id ? entry.updated : a)
      }
      return {
        annotations: newAnnotations,
        history: [...state.history, entry],
        redo: state.redo.slice(0, -1),
        lastAction: { type: 'redo', entry }
      }
    }
    case 'RESTORE': {
      return {
        annotations: action.annotations,
        history: [],
        redo: [],
        lastAction: null
      }
    }
    default: return state
  }
}
