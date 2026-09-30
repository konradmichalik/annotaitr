export const initialAnnotationState = {
  annotations: [],
  history: [],
  redo: []
}

/** What `annotations` looks like once `entry` (a history entry) is undone. */
function annotationsAfterUndo(annotations, entry) {
  if (entry.action === 'add') { return annotations.filter((a) => a.id !== entry.annotation.id) }
  if (entry.action === 'remove') { return [...annotations, entry.annotation] }
  if (entry.action === 'edit') { return annotations.map((a) => a.id === entry.id ? entry.before : a) }
  return annotations
}

/** What `annotations` looks like once `entry` is redone - the mirror of annotationsAfterUndo above. */
function annotationsAfterRedo(annotations, entry) {
  if (entry.action === 'add') { return [...annotations, entry.annotation] }
  if (entry.action === 'remove') { return annotations.filter((a) => a.id !== entry.annotation.id) }
  if (entry.action === 'edit') { return annotations.map((a) => a.id === entry.id ? entry.after : a) }
  return annotations
}

export function annotationReducer(state, action) {
  switch (action.type) {
    case 'ADD':
      return {
        annotations: [...state.annotations, action.annotation],
        history: [...state.history, { action: 'add', annotation: action.annotation }],
        redo: []
      }
    case 'UPDATE':
      // Live/preview update while a drag is in progress: applied continuously
      // (every mousemove) so it must not grow history - EDIT below is the one
      // history-bearing action for a completed move/resize/style change.
      return {
        ...state,
        annotations: state.annotations.map((a) =>
          a.id === action.id ? { ...a, ...action.changes } : a
        )
      }
    case 'EDIT': {
      // A completed move, resize, or popover edit: one history entry for the
      // whole gesture, not one per intermediate UPDATE.
      return {
        annotations: state.annotations.map((a) => a.id === action.id ? action.after : a),
        history: [...state.history, { action: 'edit', id: action.id, before: action.before, after: action.after }],
        redo: []
      }
    }
    case 'REMOVE': {
      const removed = state.annotations.find((a) => a.id === action.id)
      if (!removed) { return state }
      return {
        annotations: state.annotations.filter((a) => a.id !== action.id),
        history: [...state.history, { action: 'remove', annotation: removed }],
        redo: []
      }
    }
    case 'SET_ALL':
      return { ...state, annotations: action.annotations, history: [], redo: [] }
    case 'UNDO': {
      if (state.history.length === 0) { return state }
      const entry = state.history[state.history.length - 1]
      return {
        annotations: annotationsAfterUndo(state.annotations, entry),
        history: state.history.slice(0, -1),
        redo: [...state.redo, entry]
      }
    }
    case 'REDO': {
      if (state.redo.length === 0) { return state }
      const entry = state.redo[state.redo.length - 1]
      return {
        annotations: annotationsAfterRedo(state.annotations, entry),
        history: [...state.history, entry],
        redo: state.redo.slice(0, -1)
      }
    }
    default:
      return state
  }
}
