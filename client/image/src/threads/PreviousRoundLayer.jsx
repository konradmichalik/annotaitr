import { annotationTopAnchor } from '../utils/drawing.js'
import { statusDisplay, threadStatus } from './threadView.js'

const BADGE_HEIGHT = 20
// SVG text cannot be measured before it renders, so the pill is sized from the character count: about 6.5px per
// glyph at the 11px badge font, plus 12px of padding.
const CHAR_WIDTH = 6.5
const PADDING = 12

function Badge({ thread, anchor }) {
  const { icon, label } = statusDisplay(thread)
  const text = `${icon} ${thread.number} ${label}`
  const width = text.length * CHAR_WIDTH + PADDING
  return (
    <g className={`previous-round-badge previous-round-badge--${threadStatus(thread)}`} transform={`translate(${anchor.x - width / 2} ${Math.max(0, anchor.y - BADGE_HEIGHT - 4)})`}>
      <rect width={width} height={BADGE_HEIGHT} rx="10" />
      <text x={width / 2} y={BADGE_HEIGHT / 2} textAnchor="middle" dominantBaseline="central">{text}</text>
    </g>
  )
}

/** Last round's marks inside the canvas SVG: never part of the annotations state, only drawn. The canvas hands in its own shape renderer. */
export default function PreviousRoundLayer({ threads, Shape, fallbackColor }) {
  return (
    <g className="previous-round">
      <defs>
        {threads.map(({ annotation, handle }) => annotation.type === 'arrow' && (
          <marker key={handle} id={`arrowhead-prev-${handle}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 Z" fill={annotation.color || fallbackColor} />
          </marker>
        ))}
      </defs>
      {threads.map((thread) => (
        <g key={thread.handle} className={`previous-round-mark previous-round--${thread.anchor}`}>
          <g className="previous-round-shape">
            <Shape annotation={{ ...thread.annotation, id: `prev-${thread.handle}` }} number={thread.number} markerId={`arrowhead-prev-${thread.handle}`} />
          </g>
          <Badge thread={thread} anchor={annotationTopAnchor(thread.annotation)} />
        </g>
      ))}
    </g>
  )
}
