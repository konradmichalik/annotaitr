import { useRef, useState, useCallback, useEffect, useReducer } from 'react'
import {
  clampPoint, boxFromPoints, findAnnotationAt, translateGeometry,
  annotationCentroid, annotationBottomAnchor, annotationTopAnchor, resizeGeometry, freehandBounds,
  isPointsGeometry, MAX_POINTS_PER_ANNOTATION
} from '../utils/drawing.js'
import { pickStyleFields } from '../utils/annotationStyles.js'
import { cursorForTool } from '../utils/cursors.js'
import { intentChangeForKey } from '../utils/toolShortcuts.js'
import { elementCaption } from '../utils/elementWalk.js'
import { useElementWalk } from '../hooks/useElementWalk.js'
import { matchAnnotation, matchPoint, describeElements } from '../utils/elementMatch.js'
import { wordIndexAt, selectWords } from '../document/textSelection.js'
import { markColor, intentMark } from '../utils/annotationColors.js'
import { ACTION_ICONS } from '../utils/icons.jsx'
import CommentPopover from './CommentPopover.jsx'
import { noteType } from '../../../shared/utils/noteTypes.js'
import { defaultIntent, intentOf } from '../../../shared/utils/intents.js'
import PreviousRoundLayer from '../threads/PreviousRoundLayer.jsx'
import { AnnotationShape, ArrowMarkers } from './AnnotationShapes.jsx'
import ThreadPopover from '../threads/ThreadPopover.jsx'

const MOVE_THRESHOLD = 4

/** Tools that draw by capturing a continuous stream of points while dragging. */
function isPointCollectingTool(tool) {
  return tool === 'freehand' || tool === 'highlighter'
}

function pointFromEvent(event, wrapperRef, imageWidth, imageHeight, zoom) {
  const rect = wrapperRef.current.getBoundingClientRect()
  const raw = { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }
  return clampPoint(raw, imageWidth, imageHeight)
}

/** Convert an image-local point to viewport (client) coordinates, for anchoring a fixed-position popover. */
function toClientPoint(wrapperRef, point, zoom) {
  const rect = wrapperRef.current.getBoundingClientRect()
  return { x: rect.left + point.x * zoom, y: rect.top + point.y * zoom }
}

const BOX_HANDLES = ['nw', 'ne', 'sw', 'se']
const HANDLE_CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' }

function BoxCorners({ x, y, width, height, r, strokeWidth, onHandleMouseDown }) {
  const corners = { nw: [x, y], ne: [x + width, y], sw: [x, y + height], se: [x + width, y + height] }
  return BOX_HANDLES.map((handle) => (
    <circle
      key={handle}
      cx={corners[handle][0]} cy={corners[handle][1]} r={r}
      className="resize-handle"
      style={{ pointerEvents: 'auto', cursor: HANDLE_CURSORS[handle], strokeWidth }}
      onMouseDown={(event) => onHandleMouseDown(event, handle)}
    />
  ))
}

function SelectionHandles({ annotation, zoom, onHandleMouseDown }) {
  const r = 6 / zoom
  const strokeWidth = 2 / zoom
  if (annotation.type === 'box') {
    const { x, y, width, height } = annotation.geometry
    return <BoxCorners x={x} y={y} width={width} height={height} r={r} strokeWidth={strokeWidth} onHandleMouseDown={onHandleMouseDown} />
  }
  if (isPointsGeometry(annotation.type)) {
    const { x, y, width, height } = freehandBounds(annotation.geometry.points)
    return <BoxCorners x={x} y={y} width={width} height={height} r={r} strokeWidth={strokeWidth} onHandleMouseDown={onHandleMouseDown} />
  }
  if (annotation.type === 'arrow') {
    const { x1, y1, x2, y2 } = annotation.geometry
    return (
      <>
        <circle cx={x1} cy={y1} r={r} className="resize-handle" style={{ pointerEvents: 'auto', cursor: 'crosshair', strokeWidth }} onMouseDown={(event) => onHandleMouseDown(event, 'start')} />
        <circle cx={x2} cy={y2} r={r} className="resize-handle" style={{ pointerEvents: 'auto', cursor: 'crosshair', strokeWidth }} onMouseDown={(event) => onHandleMouseDown(event, 'end')} />
      </>
    )
  }
  return null
}

/** Floating Remove/Edit toolbar shown above a selected annotation, mirroring md-annotator's. */
function SelectionToolbar({ point, onEdit, onRemove, onClose }) {
  return (
    <div
      className="annotation-toolbar"
      style={{ top: point.y - 48, left: point.x }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="annotation-toolbar-menu">
        <button type="button" onClick={onRemove} className="annotation-toolbar-btn annotation-toolbar-btn-remove" title="Delete annotation">
          {ACTION_ICONS.remove}
          <span className="annotation-toolbar-label">Remove</span>
        </button>
        <button type="button" onClick={onEdit} className="annotation-toolbar-btn annotation-toolbar-btn-edit" title="Edit comment and color">
          {ACTION_ICONS.edit}
          <span className="annotation-toolbar-label">Edit</span>
        </button>
        <span className="annotation-toolbar-divider" />
        <button type="button" onClick={onClose} className="annotation-toolbar-btn annotation-toolbar-btn-cancel" title="Close" aria-label="Close">
          {ACTION_ICONS.close}
        </button>
      </div>
    </div>
  )
}

export default function ImageCanvas({
  imageUrl, imageAlt = 'Image being annotated', imageWidth, imageHeight, activeTool, annotations, zoom, onZoomBy,
  editingAnnotationId, onAddAnnotation, onUpdateAnnotation, onCommitEdit, onRemoveAnnotation, onRequestEdit,
  onUndo, onRedo, colorMode = 'intent', fixedColor = null, newIntent = 'change', imageRef = null,
  // A video passes its player element, the frame-visible subset of its
  // annotations and a hook to pause playback before any pointer interaction.
  // `nextNumber` is the number the note being drawn will keep.
  // describeTime(annotation | null) names what an annotation is pinned to in
  // time, null meaning the one being drawn.
  media = null, nextNumber = 1, onBeforeInteract = null, describeTime = null,
  // A PDF page's words in reading order, for the Text tool.
  voiceNotes = false, elements = [], words = [],
  // Last round's marks (placed threads only), drawn read-only and opened with the Select tool.
  previousThreads = [], previousRound = null, showPrevious = false, openThreadHandle = null, onOpenThread = null, onCloseThread = null, onReloadThreads = null, onSelectionChange = null
}) {
  const wrapperRef = useRef(null)
  // A thread opened from the panel on another page mounts this canvas with its popover already due, before the wrapper exists to anchor it to.
  const [wrapperMounted, setWrapperMounted] = useState(false)
  useEffect(() => { setWrapperMounted(true) }, [])
  const previousClickRef = useRef(null)
  // Set by the wheel handler just before onZoomBy fires, and consumed by the
  // effect below once `zoom` actually changes - carries the point that
  // should stay fixed under the cursor across the zoom change.
  const pendingZoomAnchorRef = useRef(null)

  // Ctrl/Cmd+scroll to zoom. Attached as a native listener (not React's
  // onWheel) so preventDefault reliably stops the browser's own page-zoom
  // gesture instead of silently no-opping as a passive listener.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) { return }
    const handleWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) { return }
      event.preventDefault()
      const appMain = el.closest('.app-main')
      if (appMain) {
        const wrapperRect = el.getBoundingClientRect()
        const mainRect = appMain.getBoundingClientRect()
        pendingZoomAnchorRef.current = {
          // The image-space point under the cursor, independent of the
          // current zoom/scroll - this is what must stay under the cursor.
          imageX: (event.clientX - wrapperRect.left) / zoom,
          imageY: (event.clientY - wrapperRect.top) / zoom,
          offsetX: event.clientX - mainRect.left,
          offsetY: event.clientY - mainRect.top
        }
      }
      onZoomBy(event.deltaY < 0 ? 0.1 : -0.1)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [onZoomBy, zoom])

  // Runs after `zoom` actually changes: re-scrolls `.app-main` so the point
  // captured above stays under the cursor, instead of every zoom always
  // growing/shrinking from the top-left corner.
  useEffect(() => {
    const anchor = pendingZoomAnchorRef.current
    pendingZoomAnchorRef.current = null
    if (!anchor) { return }
    const appMain = wrapperRef.current?.closest('.app-main')
    if (!appMain) { return }
    appMain.scrollLeft = anchor.imageX * zoom - anchor.offsetX
    appMain.scrollTop = anchor.imageY * zoom - anchor.offsetY
  }, [zoom])

  const [dragStart, setDragStart] = useState(null)
  const [dragPoint, setDragPoint] = useState(null)
  const [strokePoints, setStrokePoints] = useState([])
  const [pending, setPending] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  // The panel follows the selection, so the mark's card is selected and scrolled into view.
  useEffect(() => { onSelectionChange?.(selectedId) }, [selectedId, onSelectionChange])
  const [hoveringAnnotation, setHoveringAnnotation] = useState(false)
  // Where the pointer rests over the image, for outlining the page element a
  // mark placed there would be matched to. Only tracked for a captured page.
  const [hoverPoint, setHoverPoint] = useState(null)
  const [isGrabbing, setIsGrabbing] = useState(false)
  const moveState = useRef(null)
  const resizeState = useRef(null)

  // Delete/Backspace removes the selected annotation, so it doesn't require
  // opening the sidebar. Skipped while the comment popover is open (so
  // Backspace still works for editing text) and while any other text input
  // has focus (e.g. the sidebar's export/import textarea).
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') { return }
      if (!selectedId || pending) { return }
      const tag = document.activeElement?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') { return }
      event.preventDefault()
      onRemoveAnnotation(selectedId)
      setSelectedId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, pending, onRemoveAnnotation])

  // 1 to 4 set the intent of the selected mark, undoable like any other edit.
  useEffect(() => {
    if (!selectedId || pending) { return }
    const handleKeyDown = (event) => {
      const before = annotations.find((a) => a.id === selectedId)
      const intent = intentChangeForKey(event, before)
      if (!intent) { return }
      event.preventDefault()
      onCommitEdit(selectedId, before, { ...before, intent })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, pending, annotations, onCommitEdit])

  // Cmd/Ctrl+Z to undo, Cmd/Ctrl+Shift+Z or Ctrl+Y to redo. Same guards as
  // Delete/Backspace above: skipped while the popover is open or another
  // text input has focus.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (pending) { return }
      const tag = document.activeElement?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') { return }
      const isMod = event.metaKey || event.ctrlKey
      // event.key reports the shifted/Caps-Lock'd character ('Z', not 'z') -
      // without normalizing, Shift+Z-for-redo would never match, and Caps Lock
      // would break the undo branch the same way.
      const key = event.key.toLowerCase()
      if (isMod && !event.shiftKey && key === 'z') {
        event.preventDefault()
        onUndo()
      } else if (isMod && event.shiftKey && key === 'z') {
        event.preventDefault()
        onRedo()
      } else if (event.ctrlKey && !event.metaKey && key === 'y') {
        event.preventDefault()
        onRedo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pending, onUndo, onRedo])

  // The comment popover and the selection toolbar are `position: fixed`,
  // anchored to a point derived from the wrapper's live bounding rect. That
  // rect only changes on scroll, which is a native browser event - nothing
  // about it triggers a React re-render on its own, so without this the
  // popover/toolbar would stay frozen at their opening position while the
  // canvas scrolls underneath them. The capture-phase listener catches a
  // scroll on any ancestor (namely `.app-main`), not just the window itself.
  const [, forceRerenderOnScroll] = useReducer((n) => n + 1, 0)
  useEffect(() => {
    if (!pending && !selectedId && !openThreadHandle) { return }
    const onScroll = () => forceRerenderOnScroll()
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [pending, selectedId, openThreadHandle])

  const handleHandleMouseDown = useCallback((event, handle) => {
    event.preventDefault()
    event.stopPropagation()
    const annotation = annotations.find((a) => a.id === selectedId)
    if (!annotation) { return }
    resizeState.current = { id: annotation.id, type: annotation.type, startGeometry: annotation.geometry, startAnnotation: annotation, handle, moved: false }
    setIsGrabbing(true)
  }, [annotations, selectedId])

  const openEditPopover = useCallback((annotation) => {
    setPending({
      id: annotation.id,
      type: annotation.type,
      geometry: annotation.geometry,
      color: annotation.color,
      text: annotation.text,
      before: annotation,
      ...pickStyleFields(annotation.type, annotation)
    })
  }, [])

  // "Edit" clicked in the sidebar: bring the annotation into view, then open
  // the same popover used for click-to-edit-on-the-image.
  useEffect(() => {
    if (!editingAnnotationId) { return }
    const annotation = annotations.find((a) => a.id === editingAnnotationId)
    if (!annotation) { return }

    const appMain = wrapperRef.current?.closest('.app-main')
    const centroid = annotationCentroid(annotation)
    if (appMain) {
      appMain.scrollTo({ top: Math.max(0, centroid.y * zoom - appMain.clientHeight / 2), behavior: 'auto' })
    }

    setSelectedId(annotation.id)
    openEditPopover(annotation)
    onRequestEdit(null)
  }, [editingAnnotationId, annotations, onRequestEdit, zoom, openEditPopover])

  // A new mark has no ink of its own and takes its intent's colour, unless
  // the reviewer fixed an ink in the dock. The composer can still change it.
  const nextColor = colorMode === 'fixed' ? fixedColor : null

  const previousVisible = showPrevious && previousThreads.length > 0

  const handleMouseDown = useCallback((event) => {
    // While the comment popover is open, a press on the canvas never starts
    // a new mark: an untouched popover closes on it (the composer's own
    // outside-click handler), one holding a draft stays open. `pending` is
    // state, not a ref, so this closure still sees it as truthy even when
    // that handler already called setPending(null) in the same event.
    if (pending) { return }
    event.preventDefault()
    previousClickRef.current = null
    onBeforeInteract?.()
    // A drag takes over from here; the outline at the press point would
    // otherwise stay behind while an existing mark is moved away from it.
    setHoverPoint(null)
    const point = pointFromEvent(event, wrapperRef, imageWidth, imageHeight, zoom)

    // An existing annotation under the cursor always takes over, regardless
    // of the active drawing tool: a drag moves it. A click selects it (so its
    // resize handles appear) — clicking it again while already selected is
    // what opens its edit popover, so a plain first click never hides the
    // handles behind the popover.
    const hit = findAnnotationAt(point, annotations)
    if (hit) {
      const wasSelected = hit.id === selectedId
      setSelectedId(hit.id)
      setIsGrabbing(true)
      moveState.current = { id: hit.id, type: hit.type, startGeometry: hit.geometry, startAnnotation: hit, startPoint: point, moved: false, wasSelected }
      return
    }

    if (activeTool === 'select') {
      setSelectedId(null)
      const previousHit = previousVisible
        ? findAnnotationAt(point, previousThreads.map((t) => t.annotation))
        : null
      // Opened on mouseup: a popover mounted during this mousedown would see the same event as an outside click.
      previousClickRef.current = previousHit ? previousThreads.find((t) => t.annotation === previousHit).handle : null
      return
    }

    if (activeTool === 'pin' || activeTool === 'element') {
      setDragStart(point)
      return
    }

    if (activeTool === 'text') {
      setDragStart(point)
      setDragPoint(point)
      return
    }

    if (isPointCollectingTool(activeTool)) {
      setStrokePoints([point])
      return
    }

    setDragStart(point)
    setDragPoint(point)
  }, [activeTool, imageWidth, imageHeight, zoom, pending, annotations, selectedId, onBeforeInteract, previousVisible, previousThreads])

  const handleMouseMove = useCallback((event) => {
    if (resizeState.current) {
      const point = pointFromEvent(event, wrapperRef, imageWidth, imageHeight, zoom)
      const { id, type, startGeometry, handle } = resizeState.current
      resizeState.current.moved = true
      onUpdateAnnotation(id, { geometry: resizeGeometry(type, startGeometry, handle, point) })
      return
    }

    // A selected page element or text stays where it is on the page: it can
    // be picked and commented on, but not dragged off it.
    if (moveState.current && moveState.current.type !== 'element' && moveState.current.type !== 'text') {
      const point = pointFromEvent(event, wrapperRef, imageWidth, imageHeight, zoom)
      const { id, type, startGeometry, startPoint } = moveState.current
      const dx = point.x - startPoint.x
      const dy = point.y - startPoint.y
      if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
        moveState.current.moved = true
        onUpdateAnnotation(id, { geometry: translateGeometry(type, startGeometry, dx, dy) })
      }
      return
    }

    if (isPointCollectingTool(activeTool) && strokePoints.length > 0) {
      // Capped so an unusually long stroke can't produce an annotation the
      // import validator (or the server's own copy of this same limit) would
      // then refuse to accept back - see MAX_POINTS_PER_ANNOTATION in drawing.js.
      if (strokePoints.length >= MAX_POINTS_PER_ANNOTATION) { return }
      const point = pointFromEvent(event, wrapperRef, imageWidth, imageHeight, zoom)
      setStrokePoints((prev) => [...prev, point])
      return
    }

    if ((activeTool === 'box' || activeTool === 'arrow' || activeTool === 'text') && dragStart) {
      setDragPoint(pointFromEvent(event, wrapperRef, imageWidth, imageHeight, zoom))
      return
    }

    if (!pending) {
      const point = pointFromEvent(event, wrapperRef, imageWidth, imageHeight, zoom)
      const overAnnotation = !!findAnnotationAt(point, annotations)
      setHoveringAnnotation(overAnnotation)
      const outlines = elements.length > 0 && activeTool === 'element' && !overAnnotation
      setHoverPoint(outlines ? point : null)
    }
  }, [activeTool, strokePoints.length, dragStart, imageWidth, imageHeight, zoom, onUpdateAnnotation, pending, annotations, elements])

  // Every `setPending` call that starts a brand-new annotation (as opposed to editing an existing one).
  const createPending = useCallback((partial) => {
    setPending({ ...partial, intent: defaultIntent(partial.type, newIntent) })
    // The pointer now rests on the new mark, so the hover outline would
    // otherwise linger over it until the next mouse move.
    setHoverPoint(null)
  }, [newIntent])

  // The tool-specific dispatch for "a drag/click just finished, and it was a
  // draw gesture rather than a move/resize/select" - split out of
  // handleMouseUp below so that function stays focused on the drag-in-
  // progress bookkeeping it owns (resize/move commit, then handing off here).
  const handleCreateAnnotation = useCallback((point) => {
    if (activeTool === 'element' && dragStart) {
      setDragStart(null)
      const picked = matchPoint(elements, dragStart)
      if (picked) { createPending({ type: 'element', geometry: { ...picked.box }, color: nextColor }) }
    } else if (activeTool === 'text' && dragStart) {
      const selection = selectWords(words, wordIndexAt(words, dragStart), wordIndexAt(words, point))
      setDragStart(null)
      setDragPoint(null)
      if (selection) { createPending({ type: 'text', ...selection, color: nextColor }) }
    } else if (activeTool === 'pin' && dragStart) {
      setDragStart(null)
      createPending({ type: 'pin', geometry: dragStart, color: nextColor })
    } else if (activeTool === 'box' && dragStart) {
      const geometry = boxFromPoints(dragStart, point)
      setDragStart(null)
      setDragPoint(null)
      if (geometry.width > 2 && geometry.height > 2) {
        createPending({ type: 'box', geometry, color: nextColor })
      }
    } else if (activeTool === 'arrow' && dragStart) {
      setDragStart(null)
      setDragPoint(null)
      const geometry = { x1: dragStart.x, y1: dragStart.y, x2: point.x, y2: point.y }
      createPending({ type: 'arrow', geometry, color: nextColor, arrowStyle: 'head' })
    } else if (isPointCollectingTool(activeTool) && strokePoints.length > 0) {
      if (strokePoints.length > 1) {
        createPending({ type: activeTool, geometry: { points: strokePoints }, color: nextColor })
      }
      // Always clear, even for a single-point "click, no drag": otherwise
      // handleMouseMove's `strokePoints.length > 0` check keeps matching and
      // a stray stroke follows the cursor with no button held, until the
      // next mousedown happens to reset it.
      setStrokePoints([])
    }
  }, [activeTool, dragStart, strokePoints, nextColor, createPending, elements, words])

  const handleMouseUp = useCallback((event) => {
    if (pending) { return }
    if (!wrapperRef.current) { return }
    if (previousClickRef.current) {
      onOpenThread?.(previousClickRef.current)
      previousClickRef.current = null
      return
    }
    if (resizeState.current) {
      const { id, moved, startAnnotation } = resizeState.current
      resizeState.current = null
      setIsGrabbing(false)
      if (moved) {
        const after = annotations.find((a) => a.id === id)
        if (after) { onCommitEdit(id, startAnnotation, after) }
      }
      return
    }

    if (moveState.current) {
      const { id, moved, wasSelected, startAnnotation } = moveState.current
      moveState.current = null
      setIsGrabbing(false)
      if (moved) {
        const after = annotations.find((a) => a.id === id)
        if (after) { onCommitEdit(id, startAnnotation, after) }
      } else if (wasSelected) {
        // A click on an already-selected shape: open its edit popover. A
        // first click only selects it (so the handles and the Remove/Edit
        // toolbar stay visible instead of being immediately hidden behind
        // the popover).
        const annotation = annotations.find((a) => a.id === id)
        if (annotation) { openEditPopover(annotation) }
      }
      return
    }

    handleCreateAnnotation(pointFromEvent(event, wrapperRef, imageWidth, imageHeight, zoom))
  }, [imageWidth, imageHeight, zoom, annotations, openEditPopover, onCommitEdit, pending, handleCreateAnnotation, onOpenThread])

  // A window-level listener (not a React handler on the wrapper) so a drag,
  // move, or resize still finishes correctly when the button is released
  // outside the canvas (e.g. over the sidebar) - the wrapper's own mouseup
  // never fires there, which otherwise leaves the operation stuck: the next
  // mousemove over the canvas keeps interpreting it as still in progress
  // even with no button held.
  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  const handleCommentSubmit = useCallback((fields) => {
    if (pending) {
      const { text, color, intent } = fields
      const styleFields = pickStyleFields(pending.type, fields)
      if (pending.id) {
        const after = { ...pending.before, text, color, intent, ...styleFields }
        onCommitEdit(pending.id, pending.before, after)
      } else {
        // A text selection carries the words it selected along with its geometry.
        const quote = pending.type === 'text' ? { quote: pending.quote } : {}
        onAddAnnotation({ type: pending.type, geometry: pending.geometry, text, color, intent, ...styleFields, ...quote })
      }
    }
    setPending(null)
  }, [pending, onAddAnnotation, onCommitEdit])

  const handleCommentClose = useCallback(() => {
    setPending(null)
  }, [])

  const selectedAnnotation = selectedId ? annotations.find((a) => a.id === selectedId) : null
  // Computed fresh every render (not stored in state) so the scroll-triggered
  // re-render above actually moves it - see the effect that owns forceRerenderOnScroll.
  const pendingAnchorPoint = pending ? toClientPoint(wrapperRef, annotationBottomAnchor(pending), zoom) : null
  const pendingNumber = pending?.id ? pending.before.number : nextNumber

  const openThread = previousVisible && openThreadHandle ? previousThreads.find((t) => t.handle === openThreadHandle) : null

  let livePreview = null
  const previewIntent = (type) => defaultIntent(type, newIntent)
  if (activeTool === 'box' && dragStart && dragPoint) {
    livePreview = { type: 'box', geometry: boxFromPoints(dragStart, dragPoint), color: nextColor, intent: previewIntent('box') }
  } else if (activeTool === 'arrow' && dragStart && dragPoint) {
    livePreview = { type: 'arrow', geometry: { x1: dragStart.x, y1: dragStart.y, x2: dragPoint.x, y2: dragPoint.y }, color: nextColor, arrowStyle: 'head', intent: previewIntent('arrow') }
  } else if (isPointCollectingTool(activeTool) && strokePoints.length > 1) {
    livePreview = { type: activeTool, geometry: { points: strokePoints }, color: nextColor, intent: previewIntent(activeTool) }
  } else if (activeTool === 'text' && dragStart && dragPoint) {
    const selection = selectWords(words, wordIndexAt(words, dragStart), wordIndexAt(words, dragPoint))
    livePreview = selection ? { type: 'text', ...selection, color: nextColor, intent: previewIntent('text') } : null
  }

  // Only the Element tool outlines what is under the pointer; every tool
  // names the matched element in the comment popover.
  const walk = useElementWalk({
    active: activeTool === 'element' && !pending,
    elements,
    onPick: (element) => createPending({ type: 'element', geometry: { ...element.box }, color: nextColor })
  })
  const hovered = walk.current ?? (!pending && hoverPoint ? matchPoint(elements, hoverPoint) : null)
  const highlighted = hovered ? [hovered] : []
  const elementHint = pending?.type === 'text' ? `"${pending.quote}"` : describeElements(matchAnnotation(elements, pending))

  let cursor = cursorForTool(activeTool)
  if (hoveringAnnotation) { cursor = 'grab' }
  if (isGrabbing) { cursor = 'grabbing' }

  return (
    <div
      ref={wrapperRef}
      className="image-canvas-wrapper"
      style={{ width: imageWidth * zoom, height: imageHeight * zoom, cursor }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverPoint(null)}
      {...walk.canvasProps}
    >
      {media ?? <img ref={imageRef} src={imageUrl} alt={imageAlt} width={imageWidth * zoom} height={imageHeight * zoom} draggable={false} />}
      <svg
        className="annotation-overlay"
        width={imageWidth * zoom} height={imageHeight * zoom}
        viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      >
        <defs>
          <marker id="arrowhead-preview" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 Z" fill={pending ? markColor(pending) : (nextColor ?? intentMark(defaultIntent('arrow', newIntent)))} />
          </marker>
          <ArrowMarkers annotations={annotations} />
        </defs>
        {highlighted.map(({ selector, box }) => (
          <rect
            key={`element-${selector}-${box.x}-${box.y}`} className="element-highlight"
            x={box.x} y={box.y} width={box.width} height={box.height} vectorEffect="non-scaling-stroke"
          />
        ))}
        {previousVisible && <PreviousRoundLayer threads={previousThreads} Shape={AnnotationShape} />}
        {annotations.map((annotation) => (
          <AnnotationShape
            key={annotation.id} annotation={annotation} number={annotation.number}
            markerId={`arrowhead-${annotation.id}`} selected={annotation.id === selectedId}
          />
        ))}
        {pending && !pending.id && <AnnotationShape annotation={pending} number={nextNumber} markerId="arrowhead-preview" />}
        {!pending && livePreview && <AnnotationShape annotation={livePreview} number={nextNumber} markerId="arrowhead-preview" dashed />}
        {!pending && selectedAnnotation && (
          <SelectionHandles annotation={selectedAnnotation} zoom={zoom} onHandleMouseDown={handleHandleMouseDown} />
        )}
      </svg>
      {hovered && (
        // Visual only: the same name is in the comment popover and the sidebar.
        <span
          className="element-highlight-label" aria-hidden="true"
          style={{ left: hovered.box.x * zoom, top: Math.max(0, hovered.box.y * zoom - 24) }}
          ref={(label) => { if (walk.current) { label?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) } }}
        >
          {elementCaption(hovered)}
        </span>
      )}
      {walk.current && <span className="visually-hidden" aria-live="polite">{describeElements(highlighted)}</span>}
      {!pending && selectedAnnotation && (
        <SelectionToolbar
          point={toClientPoint(wrapperRef, annotationTopAnchor(selectedAnnotation), zoom)}
          onEdit={() => openEditPopover(selectedAnnotation)}
          onRemove={() => {
            onRemoveAnnotation(selectedAnnotation.id)
            setSelectedId(null)
          }}
          onClose={() => setSelectedId(null)}
        />
      )}
      {openThread && wrapperMounted && (
        <ThreadPopover
          key={openThread.handle}
          thread={openThread} round={previousRound}
          anchorPoint={toClientPoint(wrapperRef, annotationBottomAnchor(openThread.annotation), zoom)}
          onClose={onCloseThread}
          onReload={onReloadThreads}
        />
      )}
      {pending && (
        <CommentPopover
          anchorPoint={pendingAnchorPoint}
          title={`Note ${pendingNumber}, ${noteType(pending).shape.toLowerCase()}`}
          initialText={pending.text || ''}
          initialIntent={pending.id ? intentOf(pending.before) : pending.intent}
          initialColor={pending.color}
          annotationType={pending.type}
          initialArrowStyle={pending.arrowStyle}
          initialStrokeWidth={pending.strokeWidth}
          initialDashStyle={pending.dashStyle}
          isEditing={!!pending.id}
          timeBadge={describeTime ? describeTime(pending.id ? pending.before : null) : null}
          voiceNotes={voiceNotes}
          elementHint={elementHint}
          onIntentChange={(intent) => setPending((current) => (current && !current.id ? { ...current, intent } : current))}
          onSubmit={handleCommentSubmit}
          onClose={handleCommentClose}
        />
      )}
    </div>
  )
}
