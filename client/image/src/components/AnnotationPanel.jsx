import { useState, useRef, useEffect } from 'react'
import { matchAnnotation, describeElements } from '../utils/elementMatch.js'
import { noteType } from '../../../shared/utils/noteTypes.js'
import { NoteCard } from '../../../shared/components/NoteCard.jsx'
import { IntentIcon } from '../../../shared/components/IntentIcon.jsx'
import { intentBadgeStyle } from '../../../shared/utils/intents.js'
import { PanelEmpty } from '../../../shared/components/PanelEmpty.jsx'
import { isSaveKey } from '../../../shared/utils/keys.js'

/** A comment without a shape (on a page, a time or the whole target), typed and edited right in its card. */
function CommentText({ annotation, isEditing, onSave, onCancel }) {
  const [text, setText] = useState(annotation.text || '')
  const textareaRef = useRef(null)

  useEffect(() => {
    if (isEditing) {
      setText(annotation.text || '')
      textareaRef.current?.focus()
    }
  }, [isEditing, annotation.text])

  if (!isEditing) {
    return <p className="note-text">{annotation.text || <span className="panel-comment-empty">No comment</span>}</p>
  }

  const handleKeyDown = (event) => {
    if (isSaveKey(event)) {
      event.preventDefault()
      onSave(text)
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="panel-global-edit" onClick={(event) => event.stopPropagation()}>
      <textarea
        ref={textareaRef}
        className="panel-global-textarea"
        aria-label="Comment"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add your comment..."
      />
      <div className="panel-global-edit-actions">
        <button type="button" className="panel-cancel-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="panel-global-save-btn" onClick={() => onSave(text)}>Save</button>
      </div>
    </div>
  )
}

/**
 * The cards of this round, in feedback order. A card shows the number its
 * note keeps for the round, as the canvas, the image and the output do.
 * `hidden` is the general comment, which has its own row at the bottom.
 * `timeLabelFor` names the time or page of a note in a recording or PDF.
 * `autoEditId` opens a just-added comment for typing straight away.
 */
export default function AnnotationPanel({
  annotations, hidden = null, onRemove, onEdit, onEditComment, timeLabelFor = null, autoEditId = null, onAutoEditConsumed = null,
  elements = [], subject = 'image', selectedId = null, emptyKeys, approves = false
}) {
  const [editingId, setEditingId] = useState(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!autoEditId) { return }
    setEditingId(autoEditId)
    onAutoEditConsumed?.()
  }, [autoEditId, onAutoEditConsumed])

  useEffect(() => {
    if (!selectedId) { return }
    listRef.current?.querySelector(`[data-annotation-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const cards = annotations.filter((a) => a !== hidden)
  if (cards.length === 0) {
    return (
      <PanelEmpty
        lead={`Every mark becomes a numbered note the agent can find on the ${subject}.`}
        keys={emptyKeys}
        approves={approves}
      />
    )
  }

  const saveComment = (id, text) => {
    onEditComment(id, text)
    setEditingId(null)
  }

  return (
    <ul className="note-list" ref={listRef}>
      {annotations.map((annotation) => {
        if (annotation === hidden) { return null }
        const { word, intent, shape } = noteType(annotation)
        const isComment = annotation.type === 'comment'
        const elementHint = !isComment && !timeLabelFor ? describeElements(matchAnnotation(elements, annotation)) : null
        const quote = annotation.quote ? `“${annotation.quote}”` : elementHint
        const startEdit = () => (isComment ? setEditingId(annotation.id) : onEdit(annotation.id))
        return (
          <NoteCard
            key={annotation.id}
            id={annotation.id}
            number={annotation.number ?? null}
            badgeStyle={intentBadgeStyle(intent)}
            word={word}
            intent={intent}
            icon={<IntentIcon intent={intent} />}
            location={[timeLabelFor?.(annotation), shape].filter(Boolean).join(' · ')}
            quote={quote}
            selected={annotation.id === selectedId}
            onActivate={startEdit}
            onEdit={startEdit}
            onRemove={() => onRemove(annotation.id)}
          >
            {isComment
              ? <CommentText annotation={annotation} isEditing={editingId === annotation.id} onSave={(text) => saveComment(annotation.id, text)} onCancel={() => setEditingId(null)} />
              : <p className="note-text">{annotation.text || <span className="panel-comment-empty">No comment</span>}</p>}
          </NoteCard>
        )
      })}
    </ul>
  )
}
