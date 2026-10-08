import {
  HIGHLIGHTER_OPACITY, dimensionCapLines, dimensionTickLengthFor
} from '../utils/drawing.js'
import { resolveArrowStyle, strokeWidthOf, dashArrayFor } from '../utils/annotationStyles.js'
import { markColor, intentMark, intentOnMark } from '../utils/annotationColors.js'
import { intentOf } from '../../../shared/utils/intents.js'

/**
 * The marks as SVG, drawn the way the server renders them
 * (server/image/common/render.js). The canvas draws them over the image and
 * the Session gone page draws them again to save the annotated image.
 */

function BoxShape({ geometry, color, strokeWidth, dash, selectionProps }) {
  const { x, y, width, height } = geometry
  return (
    <>
      {selectionProps && <rect x={x - 3} y={y - 3} width={width + 6} height={height + 6} fill="none" {...selectionProps} />}
      <rect x={x} y={y} width={width} height={height} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={dash} />
    </>
  )
}

function ArrowShape({ annotation, color, strokeWidth, dash, markerId, selectionProps }) {
  const { x1, y1, x2, y2 } = annotation.geometry
  const style = resolveArrowStyle(annotation.arrowStyle)
  const ticks = style === 'dimension' ? dimensionCapLines(annotation.geometry, dimensionTickLengthFor(annotation)) : null
  const markerUrl = `url(#${markerId})`
  const markerEnd = style === 'head' || style === 'double' ? markerUrl : undefined
  const markerStart = style === 'double' ? markerUrl : undefined
  return (
    <>
      {selectionProps && (
        <>
          <line x1={x1} y1={y1} x2={x2} y2={y2} {...selectionProps} />
          {ticks && ticks.map((tick, i) => <line key={i} {...tick} {...selectionProps} />)}
        </>
      )}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={strokeWidth} strokeDasharray={dash}
        markerEnd={markerEnd} markerStart={markerStart}
      />
      {ticks && ticks.map((tick, i) => (
        <line key={i} {...tick} stroke={color} strokeWidth={strokeWidth} />
      ))}
    </>
  )
}

function FreehandShape({ geometry, color, strokeWidth, dash, selectionProps }) {
  const points = geometry.points.map((p) => `${p.x},${p.y}`).join(' ')
  return (
    <>
      {selectionProps && <polyline points={points} fill="none" {...selectionProps} strokeLinecap="round" strokeLinejoin="round" />}
      <polyline
        points={points} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={dash}
        strokeLinecap="round" strokeLinejoin="round"
      />
    </>
  )
}

function HighlighterShape({ geometry, color, strokeWidth, dash, selectionProps }) {
  const points = geometry.points.map((p) => `${p.x},${p.y}`).join(' ')
  return (
    <>
      {selectionProps && (
        <polyline
          points={points} fill="none" stroke="var(--primary)" strokeWidth={strokeWidth + 4}
          strokeOpacity={0.35} strokeLinecap="round" strokeLinejoin="round"
        />
      )}
      <polyline
        points={points} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={dash}
        strokeOpacity={HIGHLIGHTER_OPACITY} strokeLinecap="round" strokeLinejoin="round"
      />
    </>
  )
}

/**
 * The number on its intent's colour, with a soft light halo that only shows
 * on dark images. The same badge sits on every mark, as in the image the
 * server renders (server/image/common/render.js).
 */
function NumberBadge({ x, y, number, intent, r = 11, fontSize = 12 }) {
  if (number === undefined || number === null) { return null }
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={intentMark(intent)} stroke="var(--mark-halo)" strokeWidth="1" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill={intentOnMark(intent)} fontSize={fontSize} fontWeight="700">
        {number}
      </text>
    </>
  )
}

function PinShape({ geometry, intent, number, selectionProps }) {
  const { x, y } = geometry
  return (
    <>
      {selectionProps && <circle cx={x} cy={y} r="18" fill="none" {...selectionProps} />}
      <NumberBadge x={x} y={y} number={number ?? ''} intent={intent} r={14} fontSize={13} />
    </>
  )
}

// The light fill tells a selected page element apart from a hand-drawn box,
// matching the server's rendering in server/image/common/render.js.
function ElementShape({ geometry, color, selectionProps }) {
  const { x, y, width, height } = geometry
  return (
    <>
      {selectionProps && <rect x={x - 3} y={y - 3} width={width + 6} height={height + 6} fill="none" {...selectionProps} />}
      <rect x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={3} />
    </>
  )
}

// Painted like a marker over the selected lines, matching the server's
// rendering in server/image/common/render.js.
function TextShape({ geometry, color, selectionProps }) {
  return geometry.rects.map(({ x, y, width, height }) => (
    <rect key={`${x}-${y}`} x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.3} {...(selectionProps ?? {})} />
  ))
}

/** Where a shape's number badge sits, matching the server's rendering. */
function badgePoint({ type, geometry }) {
  if (type === 'text') { return geometry.rects[0] }
  if (type === 'arrow') { return { x: geometry.x1, y: geometry.y1 } }
  if (type === 'freehand' || type === 'highlighter') { return geometry.points[0] }
  return { x: geometry.x, y: geometry.y }
}

// `badge` is off for an earlier round's mark, whose number sits in its status badge instead.
export function AnnotationShape({ annotation, number, markerId, dashed = false, selected = false, badge = true }) {
  const color = markColor(annotation)
  const intent = intentOf(annotation)
  const shape = <ShapeBody annotation={annotation} color={color} intent={intent} number={number} markerId={markerId} dashed={dashed} selected={selected} />
  if (!badge || annotation.type === 'pin' || !annotation.geometry) { return shape }
  const point = badgePoint(annotation)
  return (
    <>
      {shape}
      {point && <NumberBadge x={point.x} y={point.y} number={number} intent={intent} />}
    </>
  )
}

function ShapeBody({ annotation, color, intent, number, markerId, dashed, selected }) {
  const strokeWidth = strokeWidthOf(annotation)
  // The live "uncommitted preview" dash always wins over a stored dashStyle:
  // a not-yet-drawn annotation has no dashStyle chosen yet, and this is the
  // only path where `dashed` is ever true (see the `dashed` prop's call sites).
  const dash = dashed ? '6 4' : dashArrayFor(annotation.dashStyle, strokeWidth)
  const selectionProps = selected ? { stroke: 'var(--primary)', strokeWidth: strokeWidth + 3, strokeOpacity: 0.35 } : null
  const { type, geometry } = annotation

  if (type === 'element') { return <ElementShape geometry={geometry} color={color} selectionProps={selectionProps} /> }
  if (type === 'text') { return <TextShape geometry={geometry} color={color} selectionProps={selectionProps} /> }
  if (type === 'box') { return <BoxShape geometry={geometry} color={color} strokeWidth={strokeWidth} dash={dash} selectionProps={selectionProps} /> }
  if (type === 'arrow') { return <ArrowShape annotation={annotation} color={color} strokeWidth={strokeWidth} dash={dash} markerId={markerId} selectionProps={selectionProps} /> }
  if (type === 'freehand') { return <FreehandShape geometry={geometry} color={color} strokeWidth={strokeWidth} dash={dash} selectionProps={selectionProps} /> }
  if (type === 'highlighter') { return <HighlighterShape geometry={geometry} color={color} strokeWidth={strokeWidth} dash={dash} selectionProps={selectionProps} /> }
  if (type === 'pin') { return <PinShape geometry={geometry} intent={intent} number={number} selectionProps={selectionProps} /> }
  return null
}

/** One arrowhead marker per arrow that has a head, referenced as `arrowhead-<id>`. */
export function ArrowMarkers({ annotations }) {
  return annotations.map((annotation) => annotation.type === 'arrow'
    && ['head', 'double'].includes(resolveArrowStyle(annotation.arrowStyle)) && (
    <marker
      key={`marker-${annotation.id}`}
      id={`arrowhead-${annotation.id}`}
      markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse"
    >
      <path d="M0,0 L10,5 L0,10 Z" fill={markColor(annotation)} />
    </marker>
  ))
}
