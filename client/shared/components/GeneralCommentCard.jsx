import { NoteCard } from './NoteCard.jsx'
import { CommentIcon } from './HeaderIcons.jsx'
import { noteType } from '../utils/noteTypes.js'

/**
 * The general comment in the note list: no number and no intent, the full
 * text, edit and delete. Editing opens the field of the row at the bottom.
 * `children` replace the plain text, for a client that renders it richer.
 */
export function GeneralCommentCard({ annotation, editor, children = null }) {
  return (
    <NoteCard
      id={annotation.id}
      label="General comment"
      word={noteType(annotation).word}
      icon={<CommentIcon />}
      selectable={false}
      buttonRef={editor.cardRef}
      onActivate={editor.start}
      onEdit={editor.start}
      onRemove={editor.remove}
    >
      {children ?? <p className="note-text">{editor.text}</p>}
    </NoteCard>
  )
}
