import { useState } from 'react'
import { flashElement } from '../utils/flashElement.js'

/** Read-only notes the agent left on applied changes, as context for this round. */
export function AgentNotes({ notes, selectedAnnotationId, onSelect }) {
  const [notesCollapsed, setNotesCollapsed] = useState(false)
  if (notes.length === 0) { return null }
  return (
    <div className="panel-notes-section">
      <button
        type="button"
        className="panel-header panel-header-notes panel-header-collapsible"
        onClick={() => setNotesCollapsed(prev => !prev)}
        aria-expanded={!notesCollapsed}
      >
        <svg className={`panel-collapse-icon${notesCollapsed ? '' : ' panel-collapse-icon--expanded'}`} viewBox="0 0 16 16" width="10" height="10">
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2>Notes</h2>
        <span className="panel-badge">{notes.length}</span>
      </button>
      {!notesCollapsed && (
        <>
          {notes.map(ann => {
            const handleNoteClick = () => {
              onSelect(ann.id)
              if (ann.targetType === 'global') {return}
              const el = document.querySelector(`[data-highlight-id="${ann.id}"]`)
                || document.querySelector(`[data-block-id="${ann.blockId}"]`)
              if (el) {
                flashElement(el)
              }
            }

            return (
            <div
              key={ann.id}
              data-annotation-id={ann.id}
              className={`panel-note-item${ann.id === selectedAnnotationId ? ' selected' : ''}`}
              onClick={handleNoteClick}
            >
              <div className="panel-item-header">
                <button
                  type="button"
                  className="panel-item-select"
                  aria-pressed={ann.id === selectedAnnotationId}
                  onClick={(e) => { e.stopPropagation(); handleNoteClick() }}
                >
                  <span className="panel-type-badge notes">Note</span>
                </button>
              </div>
              <p className="panel-comment-text">{ann.text}</p>
              {ann.originalText && (
                <p className="panel-original-text">"{ann.originalText.length > 60
                  ? ann.originalText.slice(0, 60) + '...'
                  : ann.originalText}"</p>
              )}
            </div>
            )
          })}
          <p className="panel-notes-hint">Added by AI as feedback on applied changes.</p>
        </>
      )}
    </div>
  )
}
