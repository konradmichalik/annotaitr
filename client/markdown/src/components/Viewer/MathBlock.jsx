import { useMemo } from 'react'
import { renderMath } from '../../utils/renderMath.js'
import { NoteBorder } from './BlockRenderer.jsx'

export function MathBlock({ block, onMathClick, annotationType, hasNote, onNoteClick }) {
  const rendered = useMemo(() => renderMath(block.content, true), [block.content])

  const annClass = annotationType === 'DELETION'
    ? ' annotated-deletion'
    : annotationType ? ' annotated-comment' : ''

  const handleActivate = (e) => {
    e.stopPropagation()
    onMathClick({ blockId: block.id, content: block.content, element: e.currentTarget })
  }

  // Without a handler the formula is only shown, as in the read-only changes view.
  const control = onMathClick
    ? {
      className: `block-math annotatable-math${annClass}`,
      role: 'button',
      tabIndex: 0,
      'aria-label': `Annotate formula: ${block.content}`,
      onClick: handleActivate,
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate(e) }
      }
    }
    : { className: 'block-math' }

  return (
    <div className="block-math-wrapper" data-block-id={block.id}>
      {hasNote && <NoteBorder blockId={block.id} onClick={onNoteClick} />}
      <div {...control}>
        {rendered.error
          ? <code className="block-math-error" title={rendered.error}>{block.content}</code>
          : <span dangerouslySetInnerHTML={{ __html: rendered.html }} />}
      </div>
    </div>
  )
}
