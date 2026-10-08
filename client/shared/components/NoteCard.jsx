import { CloseIcon } from './CloseIcon.jsx'
import { PenIcon } from './HeaderIcons.jsx'

/**
 * One note in the feedback panel: its number on the note's colour, the type
 * word with its icon, where it sits, then the quote and the comment. The
 * whole card selects the note with the mouse; the type button is its
 * keyboard handle. Edit and remove show on hover and on keyboard focus.
 */
export function NoteCard({
  id, number = null, badgeStyle, word, icon = null, intent = null, location = null, quote = null,
  selected = false, selectable = true, onActivate, onEdit = null, onRemove = null, label = null, buttonRef = null, children
}) {
  const name = label ?? [number !== null ? `${number}. ${word}` : word, location].filter(Boolean).join(', ')
  return (
    <li className={`note-card${selected ? ' selected' : ''}`} data-annotation-id={id} onClick={onActivate}>
      <div className="note-card-head">
        <button
          ref={buttonRef}
          type="button"
          className="note-card-select"
          aria-pressed={selectable ? selected : undefined}
          aria-label={name}
          onClick={(event) => { event.stopPropagation(); onActivate() }}
        >
          {number !== null && <span className="note-number" style={badgeStyle}>{number}</span>}
          <span className={`note-type${intent ? ` note-type--${intent}` : ''}`}>{icon}{word}</span>
        </button>
        {location && <span className="note-location">{location}</span>}
        {(onEdit || onRemove) && (
          <div className="note-card-actions">
            {onEdit && (
              <button type="button" className="note-card-action" title="Edit annotation" aria-label="Edit annotation"
                onClick={(event) => { event.stopPropagation(); onEdit() }}>
                <PenIcon size={14} />
              </button>
            )}
            {onRemove && (
              <button type="button" className="note-card-action note-card-action--remove" title="Delete annotation" aria-label="Delete annotation"
                onClick={(event) => { event.stopPropagation(); onRemove() }}>
                <CloseIcon />
              </button>
            )}
          </div>
        )}
      </div>
      {quote && <p className="note-quote">{quote}</p>}
      {children}
    </li>
  )
}
