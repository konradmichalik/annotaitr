import { useState, useEffect, useId, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ANNOTATION_COLORS } from '../utils/annotationColors.js'
import { TOOL_ICONS } from '../utils/icons.jsx'
import { resolveArrowStyle, strokeWidthOf } from '../utils/annotationStyles.js'
import { Composer } from '../../../shared/components/Composer.jsx'
import { hasDraft } from '../../../shared/utils/composerDraft.js'
import StylePalette from './StylePalette.jsx'
import VoiceNoteButton from './VoiceNoteButton.jsx'

const POPOVER_WIDTH = 320
const POPOVER_HEIGHT_ESTIMATE = 150
const GAP = 12

/**
 * Places the popover below the annotated element by default (so it never
 * covers what it's talking about), flipping above only when there isn't
 * enough room below the anchor point.
 */
function computePosition(anchorPoint) {
  let left = anchorPoint.x - POPOVER_WIDTH / 2
  left = Math.max(16, Math.min(left, window.innerWidth - POPOVER_WIDTH - 16))

  const spaceBelow = window.innerHeight - anchorPoint.y
  const flipAbove = spaceBelow < POPOVER_HEIGHT_ESTIMATE + GAP

  return flipAbove
    ? { bottom: window.innerHeight - anchorPoint.y + GAP, left }
    : { top: anchorPoint.y + GAP, left }
}

/**
 * A small in-page comment box anchored near an annotation (either one just
 * drawn, or an existing one being edited), so the human never leaves the
 * annotator UI to type a comment or pick a color. `title` names it for
 * assistive tech ("Note 3, box").
 */
export default function CommentPopover({
  anchorPoint, title, initialText = '', initialColor, annotationType, initialArrowStyle,
  initialStrokeWidth, initialDashStyle, isEditing = false, timeBadge = null, voiceNotes = false, elementHint = null,
  onSubmit, onClose
}) {
  const [text, setText] = useState(initialText)
  const [initialStyle] = useState(() => ({
    color: initialColor || ANNOTATION_COLORS[0].hex,
    arrowStyle: resolveArrowStyle(initialArrowStyle),
    strokeWidth: strokeWidthOf({ type: annotationType, strokeWidth: initialStrokeWidth }),
    dashStyle: initialDashStyle || 'solid'
  }))
  const [style, setStyle] = useState(initialStyle)
  const textareaRef = useRef(null)
  const titleId = useId()
  const styleChanged = Object.keys(style).some((key) => style[key] !== initialStyle[key])

  useEffect(() => {
    const id = setTimeout(() => textareaRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [])

  // A transcript is appended rather than replacing what was typed, and the
  // field gets focus back so it can be corrected right away.
  const appendVoiceText = useCallback((spoken) => {
    setText((current) => (current.trim() ? `${current.trimEnd()} ${spoken}` : spoken))
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(() => {
    onSubmit({ text: text.trim(), ...style })
  }, [text, style, onSubmit])

  const tools = (
    <>
      <StylePalette annotationType={annotationType} style={style} onChange={(change) => setStyle((current) => ({ ...current, ...change }))} />
      {voiceNotes && <VoiceNoteButton onText={appendVoiceText} />}
      {timeBadge && <span className="comment-popover-time">{timeBadge}</span>}
    </>
  )

  return createPortal(
    <Composer
      title={title}
      titleId={titleId}
      style={{ ...computePosition(anchorPoint), width: POPOVER_WIDTH }}
      dirty={hasDraft(text, initialText, styleChanged)}
      submitLabel={isEditing ? 'Save' : 'Add'}
      tools={tools}
      onSave={handleSubmit}
      onDiscard={onClose}
    >
      <div className="comment-popover-body">
        <textarea
          ref={textareaRef}
          className="comment-popover-textarea"
          placeholder="Add a comment…"
          aria-labelledby={titleId}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {elementHint && (
        <p className="comment-popover-element" title={elementHint}>
          {annotationType === 'text' ? TOOL_ICONS.text : TOOL_ICONS.element}
          <span className="visually-hidden">{annotationType === 'text' ? 'Selected text: ' : 'Element: '}</span>
          <span className="comment-popover-element-name">{elementHint}</span>
        </p>
      )}
    </Composer>,
    document.body
  )
}
