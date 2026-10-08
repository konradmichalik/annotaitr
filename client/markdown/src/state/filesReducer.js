import { annotationReducer, initialAnnotationState } from './annotationReducer.js'
import { isNumbered, intentOf, nextNumber, normalizeNotes } from '../../../shared/utils/intents.js'
import { sortNotes } from '../utils/noteNumbers.js'

// Every note of a file, also the ones undo or redo can bring back.
const notesOf = ({ annState }) => [
  ...annState.annotations,
  ...[...annState.history, ...annState.redo].flatMap((entry) => [entry.annotation, entry.updated])
]

/**
 * Numbers run across all files of the review and stay with their note for the
 * round: a new note gets the next free number, loaded notes keep theirs, and
 * notes from before numbers were stored are numbered in document order.
 */
function withNotesNumbered(state, idx, annAction) {
  if (annAction.type === 'ADD' && isNumbered(annAction.annotation)) {
    const { annotation } = annAction
    const number = annotation.number ?? nextNumber(state.flatMap(notesOf))
    return { ...annAction, annotation: { ...annotation, intent: intentOf(annotation), number } }
  }
  if (annAction.type === 'RESTORE') {
    const reserved = state.filter((_, i) => i !== idx).flatMap(notesOf).map((a) => a?.number)
    const order = (list) => sortNotes(list, state[idx].blocks || [])
    return { ...annAction, annotations: normalizeNotes(annAction.annotations, { order, reserved }) }
  }
  return annAction
}

export function filesReducer(state, action) {
  switch (action.type) {
    case 'INIT_FILES':
      return action.files.map((f, i) => ({
        ...f,
        opened: i === 0,
        reviewed: false,
        annState: { ...initialAnnotationState }
      }))
    case 'ADD_FILE':
      return [...state, { ...action.file, opened: false, reviewed: false, annState: { ...initialAnnotationState } }]
    case 'UPDATE_FILE': {
      const idx = action.fileIndex
      if (idx < 0 || idx >= state.length) {return state}
      return state.map((f, i) => i !== idx ? f : { ...f, ...action.updates })
    }
    // Shown once: the overview then stops saying "not opened".
    case 'MARK_OPENED': {
      const idx = action.fileIndex
      if (idx < 0 || idx >= state.length || state[idx].opened) { return state }
      return state.map((f, i) => i !== idx ? f : { ...f, opened: true })
    }
    // Reviewed is the reviewer's call ("Mark file as reviewed"), not a side effect of opening.
    case 'SET_REVIEWED': {
      const idx = action.fileIndex
      if (idx < 0 || idx >= state.length) { return state }
      return state.map((f, i) => i !== idx ? f : { ...f, opened: true, reviewed: action.reviewed })
    }
    case 'ANN': {
      const idx = action.fileIndex
      if (idx < 0 || idx >= state.length) {return state}
      return state.map((f, i) => {
        if (i !== idx) {return f}
        return { ...f, annState: annotationReducer(f.annState, withNotesNumbered(state, idx, action.annAction)) }
      })
    }
    default:
      return state
  }
}
