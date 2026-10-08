import { annotationTopAnchor } from '../utils/drawing.js'
import { statusDisplay, threadStatus, badgeShowsNumber, threadNumber, pendingReplies } from './threadView.js'

const BADGE_HEIGHT = 20
const MARKER_SIZE = 16
const GAP = 4
// SVG text cannot be measured before it renders, so the chip is sized from the character count: about 7px per
// glyph at the 12px badge font, plus 16px of padding.
const CHAR_WIDTH = 7
const PADDING = 16

function Badge({ thread, anchor }) {
  const { label } = statusDisplay(thread)
  const replyPending = pendingReplies(thread).length > 0
  // The two extra characters make room for the ' ↩' appended to the label.
  const chipWidth = (label.length + (replyPending ? 2 : 0)) * CHAR_WIDTH + PADDING
  const markerWidth = badgeShowsNumber(thread) ? MARKER_SIZE + GAP : 0
  const width = markerWidth + chipWidth
  return (
    <g className={`previous-round-badge status--${threadStatus(thread)}`} transform={`translate(${anchor.x - width / 2} ${Math.max(0, anchor.y - BADGE_HEIGHT - 4)})`} role={replyPending ? 'img' : undefined} aria-label={replyPending ? `${label}, reply pending` : undefined}>
      {replyPending && <title>{label}, reply pending</title>}
      {markerWidth > 0 && (
        <>
          <circle className="previous-round-badge-marker" cx={MARKER_SIZE / 2} cy={BADGE_HEIGHT / 2} r={MARKER_SIZE / 2} />
          <text className="previous-round-badge-number" x={MARKER_SIZE / 2} y={BADGE_HEIGHT / 2} textAnchor="middle" dominantBaseline="central">{threadNumber(thread)}</text>
        </>
      )}
      {/* The tint is translucent like the sidebar chip, so an opaque plate underneath keeps the label readable over any image. */}
      <rect className="previous-round-badge-plate" x={markerWidth} width={chipWidth} height={BADGE_HEIGHT} rx={BADGE_HEIGHT / 2} />
      <rect className="previous-round-badge-chip" x={markerWidth} width={chipWidth} height={BADGE_HEIGHT} rx={BADGE_HEIGHT / 2} />
      <text className="previous-round-badge-label" x={markerWidth + chipWidth / 2} y={BADGE_HEIGHT / 2} textAnchor="middle" dominantBaseline="central">{label}{replyPending ? ' ↩' : ''}</text>
    </g>
  )
}

/** Last round's marks inside the canvas SVG: never part of the annotations state, only drawn. The canvas hands in its own shape renderer. */
export default function PreviousRoundLayer({ threads, Shape }) {
  return (
    <g className="previous-round">
      <defs>
        {threads.map(({ annotation, handle }) => annotation.type === 'arrow' && (
          <marker key={handle} id={`arrowhead-prev-${handle}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse">
            <path className="previous-round-arrowhead" d="M0,0 L10,5 L0,10 Z" />
          </marker>
        ))}
      </defs>
      {threads.map((thread) => (
        <g key={thread.handle} className={`previous-round-mark previous-round--${thread.anchor}`}>
          <g className="previous-round-shape">
            <Shape annotation={{ ...thread.annotation, id: `prev-${thread.handle}` }} number={threadNumber(thread)} badge={false} markerId={`arrowhead-prev-${thread.handle}`} />
          </g>
          <Badge thread={thread} anchor={annotationTopAnchor(thread.annotation)} />
        </g>
      ))}
    </g>
  )
}
