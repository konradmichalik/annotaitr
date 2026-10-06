/* global __APP_VERSION__ */
import { useEffect, useReducer, useState, useCallback, useRef } from 'react'
import { annotationReducer, initialAnnotationState } from './state/annotationReducer.js'
import { createAnnotationId } from '../../shared/utils/annotationId.js'
import Toolbar from './components/Toolbar.jsx'
import ZoomControls from './components/ZoomControls.jsx'
import ViewportControl from './components/ViewportControl.jsx'
import CaptureOverlay from './components/CaptureOverlay.jsx'
import ImageCanvas from './components/ImageCanvas.jsx'
import AnnotationPanel from './components/AnnotationPanel.jsx'
import ExportModal from './components/ExportModal.jsx'
import ExportMenu from './components/ExportMenu.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import Timeline from './components/Timeline.jsx'
import MediaSlot from './components/MediaSlot.jsx'
import PageStrip from './components/PageStrip.jsx'
import PageNav from './components/PageNav.jsx'
import PageImage from './components/PageImage.jsx'
import { useSettings } from './hooks/useSettings.js'
import { useMediaPlayer } from './hooks/useMediaPlayer.js'
import { useVideoReview } from './hooks/useVideoReview.js'
import { useTimelineShortcuts } from './hooks/useTimelineShortcuts.js'
import { useDocumentReview } from './hooks/useDocumentReview.js'
import { useDocumentShortcuts } from './hooks/useDocumentShortcuts.js'
import { pageLabel, isPaged } from './utils/documentPages.js'
import { uploadFrames } from './utils/uploadFrames.js'
import { formatTimes } from './utils/timeline.js'
import { readError } from './utils/readError.js'
import { useAutoClose } from '../../shared/hooks/useAutoClose.js'
import { useServerConnection } from '../../shared/hooks/useServerConnection.js'
import { useResizablePanel } from '../../shared/hooks/useResizablePanel.js'
import { UpdateBanner } from '../../shared/components/UpdateBanner.jsx'
import { Logo } from '../../shared/components/Logo.jsx'
import { getItem, setItem } from '../../shared/utils/storage.js'

const ORIGIN_LABELS = {
  'claude-code': 'Claude Code',
  'opencode': 'OpenCode',
  'vibe': 'Mistral Vibe'
}

function getInitialSidebarCollapsed() {
  return getItem('img-annotator-sidebar-collapsed') === 'true'
}

/** Elements of a captured web page; empty for files, the clipboard and recordings. */
function loadElements(setElements) {
  return fetch('/api/elements')
    .then((r) => (r.ok ? r.json() : null))
    .then((r) => setElements(r?.data?.elements ?? []))
    .catch(() => setElements([]))
}

export default function App() {
  const [state, dispatch] = useReducer(annotationReducer, initialAnnotationState)
  const [meta, setMeta] = useState(null)
  // Elements of a captured web page (empty for files, the clipboard and
  // recordings), so the canvas can outline and name what each mark hits.
  const [elements, setElements] = useState([])
  // What is being captured right now ("Tablet 768×1024"), or null.
  const [recapturing, setRecapturing] = useState(null)
  const [imageUrl, setImageUrl] = useState(null)
  const [decision, setDecision] = useState(null)
  const [activeTool, setActiveTool] = useState('select')
  const [showExport, setShowExport] = useState(false)
  const [editingAnnotationId, setEditingAnnotationId] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed)
  const [status, setStatus] = useState('')
  const [toast, setToast] = useState(null)
  const [autoEditId, setAutoEditId] = useState(null)
  const [exportProgress, setExportProgress] = useState(null)
  const { settings, updateSetting, resetSettings } = useSettings()
  const { isVideo, controller, playerState, error: mediaError } = useMediaPlayer(meta)
  const video = useVideoReview({ controller, playerState, annotations: state.annotations })
  const doc = useDocumentReview({ meta, annotations: state.annotations })
  const { isDocument } = doc
  // Ordering, numbering and what the canvas shows follow the time axis of a
  // recording or the page axis of a PDF; a still image passes straight through.
  const review = isDocument ? doc : video
  const mediaWidth = isVideo ? controller?.width : (isDocument ? doc.currentPage?.width : meta?.width)
  const mediaHeight = isVideo ? controller?.height : (isDocument ? doc.currentPage?.height : meta?.height)
  const subject = isVideo ? 'recording' : (isDocument ? 'document' : 'image')
  const { state: autoCloseState, enableAndStart } = useAutoClose(!!decision, settings.autoCloseDelay)
  const { serverGone, reconnectState } = useServerConnection({ submitted: !!decision })
  const { width: panelWidth, handleMouseDown: handlePanelResize } = useResizablePanel('img-annotator-panel-width', 300, 1)
  const toastTimerRef = useRef(null)
  // Guards submit() synchronously: the buttons only disable once frame
  // export reports progress, which is too late to stop a double click.
  const submittingRef = useRef(false)
  // The annotation as it was when a marker drag began, so the whole drag
  // becomes one undo step.
  const markerDragRef = useRef(null)
  const errorTimerRef = useRef(null)

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) { clearTimeout(toastTimerRef.current) }
    setToast(message)
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  const setErrorStatus = useCallback((message) => {
    setStatus(message)
    if (errorTimerRef.current) { clearTimeout(errorTimerRef.current) }
    errorTimerRef.current = setTimeout(() => {
      setStatus((prev) => (prev === message ? '' : prev))
      errorTimerRef.current = null
    }, 5000)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) { clearTimeout(toastTimerRef.current) }
      if (errorTimerRef.current) { clearTimeout(errorTimerRef.current) }
    }
  }, [])

  useEffect(() => {
    setItem('img-annotator-sidebar-collapsed', sidebarCollapsed)
  }, [sidebarCollapsed])

  useEffect(() => {
    fetch('/api/meta').then((r) => r.json()).then((r) => setMeta(r.data)).catch((err) => setErrorStatus('Error loading image metadata: ' + err.message))
    setImageUrl('/api/image')
    loadElements(setElements)
    fetch('/api/annotations')
      .then((r) => r.json())
      .then((r) => dispatch({ type: 'SET_ALL', annotations: r.data.annotations }))
      .catch((err) => setErrorStatus('Error loading annotations: ' + err.message))
  }, [setErrorStatus])

  // Debounced auto-save to the server, so a fast drag doesn't fire one POST
  // per mousemove - only settles 500ms after the annotations actually stop
  // changing. Skipped once a decision has been submitted.
  useEffect(() => {
    if (!meta || decision) { return }
    const timer = setTimeout(() => {
      fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: state.annotations })
      }).catch(() => {
        // Silent failure - persistence is best-effort, the heartbeat/disconnect
        // screen is what surfaces a truly lost server.
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [state.annotations, meta, decision])

  // Capture the URL again with new settings. The server discards the
  // annotations, since their coordinates belong to the old layout, so the
  // reviewer confirms that first. Resolves to an error message, or null.
  const recapture = useCallback(async (request, label) => {
    const count = state.annotations.length
    const plural = count === 1 ? '' : 's'
    if (count > 0 && !window.confirm(`Capturing again discards ${count} annotation${plural}. Continue?`)) {
      return `Not captured again, ${count === 1 ? 'your annotation is' : `your ${count} annotations are`} kept.`
    }
    setRecapturing(label)
    try {
      const res = await fetch('/api/recapture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request)
      })
      if (!res.ok) { return await readError(res) }
      const body = await res.json()
      dispatch({ type: 'SET_ALL', annotations: [] })
      setMeta((current) => ({ ...current, width: body.data.width, height: body.data.height, capture: body.data.capture }))
      setImageUrl(`/api/image?capture=${Date.now()}`)
      await loadElements(setElements)
      return null
    } catch (error) {
      return `Capture failed: ${error.message}`
    } finally {
      setRecapturing(null)
    }
  }, [state.annotations.length])

  const { takeTimes, range, clearRange } = video
  const { takePage } = doc
  const addAnnotation = useCallback((partial) => {
    dispatch({
      type: 'ADD',
      annotation: { id: createAnnotationId(), createdAt: Date.now(), ...partial, ...takeTimes(), ...takePage() }
    })
  }, [takeTimes, takePage])

  const addComment = useCallback((times) => {
    const id = createAnnotationId()
    dispatch({
      type: 'ADD',
      annotation: { id, createdAt: Date.now(), type: 'comment', geometry: null, text: '', color: null, ...times }
    })
    setAutoEditId(id)
    setSidebarCollapsed(false)
  }, [])

  const addGlobalComment = useCallback(() => addComment({}), [addComment])
  const pageShown = doc.current
  const addPageComment = useCallback(() => addComment({ page: pageShown }), [addComment, pageShown])
  const clearAutoEdit = useCallback(() => setAutoEditId(null), [])

  const addSpanComment = useCallback(() => {
    addComment({ time: range.start, endTime: range.end })
    clearRange()
  }, [addComment, range, clearRange])

  const seekTo = isDocument ? doc.seekTo : video.seekTo
  const editAnnotation = useCallback((id) => {
    const annotation = state.annotations.find((a) => a.id === id)
    if (annotation) { seekTo(annotation) }
    setEditingAnnotationId(id)
  }, [state.annotations, seekTo])

  const changeMarkerTimes = useCallback((id, times, phase) => {
    const current = state.annotations.find((a) => a.id === id)
    if (!current) { return }
    if (markerDragRef.current?.id !== id) { markerDragRef.current = { id, before: current } }
    if (phase === 'preview') {
      dispatch({ type: 'UPDATE', id, changes: times })
      return
    }
    dispatch({ type: 'EDIT', id, before: markerDragRef.current.before, after: { ...current, ...times } })
    markerDragRef.current = null
  }, [state.annotations])

  const { drawTimes } = video
  const describeTime = useCallback(
    (annotation) => formatTimes(annotation ?? drawTimes, { at: 'At ', from: 'Span ', to: ' → ' }),
    [drawTimes]
  )

  const { captureTimes } = video
  const beforeCanvasInteract = useCallback(() => {
    controller.pause()
    captureTimes()
  }, [controller, captureTimes])

  useTimelineShortcuts({
    controller,
    disabled: settingsOpen || showExport || !!decision || !!exportProgress,
    onMarkStart: video.markStart,
    onMarkEnd: video.markEnd
  })

  // A comment popover belongs to the page it was opened on.
  const { goTo, step } = doc
  const goToPage = useCallback((page) => {
    setEditingAnnotationId(null)
    goTo(page)
  }, [goTo])
  const stepPage = useCallback((delta) => {
    setEditingAnnotationId(null)
    step(delta)
  }, [step])

  useDocumentShortcuts({
    enabled: isDocument,
    disabled: settingsOpen || showExport || !!decision,
    onStep: stepPage
  })

  const editGlobalComment = useCallback((id, text) => {
    const before = state.annotations.find((a) => a.id === id)
    if (!before) { return }
    dispatch({ type: 'EDIT', id, before, after: { ...before, text } })
  }, [state.annotations])

  const removeAnnotation = useCallback((id) => {
    dispatch({ type: 'REMOVE', id })
  }, [])

  const updateAnnotation = useCallback((id, changes) => {
    dispatch({ type: 'UPDATE', id, changes })
  }, [])

  const commitEditAnnotation = useCallback((id, before, after) => {
    dispatch({ type: 'EDIT', id, before, after })
  }, [])

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])

  const importAnnotations = useCallback((annotations) => {
    if (isVideo && annotations.some((a) => a.type !== 'comment' && typeof a.time !== 'number')) {
      setErrorStatus('Import failed: these annotations belong to a still image, not to a recording.')
      return
    }
    const reviewed = new Set(doc.pages.map((p) => p.number))
    if (isDocument && annotations.some((a) => (a.type !== 'comment' && !isPaged(a)) || (isPaged(a) && !reviewed.has(a.page)))) {
      setErrorStatus('Import failed: these annotations belong to another image or to pages not part of this review.')
      return
    }
    dispatch({ type: 'SET_ALL', annotations })
    showToast(`Imported ${annotations.length} annotation${annotations.length === 1 ? '' : 's'}`)
  }, [showToast, isVideo, isDocument, doc.pages, setErrorStatus])

  const submit = useCallback(async (endpoint) => {
    if (submittingRef.current) { return }
    submittingRef.current = true
    try {
      // Flush the current annotations synchronously before deciding - /api/approve
      // and /api/feedback read the server's own state.annotations, which the
      // debounced auto-save effect above may not have posted yet if the user
      // submits within 500ms of their last edit.
      const flush = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: state.annotations })
      })
      // Deciding on whatever the server last accepted would drop or alter
      // annotations without the reviewer noticing.
      if (!flush.ok) { throw new Error(`annotations were not saved: ${await readError(flush)}`) }
      // A recording's output is built from frames only the browser can
      // decode, so they are grabbed and uploaded before the decision.
      if (controller && state.annotations.length > 0) {
        controller.pause()
        await uploadFrames(controller, (done, total) => setExportProgress({ done, total }))
      }
      const res = await fetch(`/api/${endpoint}`, { method: 'POST' })
      if (!res.ok) { throw new Error(await readError(res)) }
      setDecision(endpoint === 'approve' ? 'approved' : 'feedback')
    } catch (err) {
      setErrorStatus(`${endpoint === 'approve' ? 'Approve' : 'Submit'} failed: ${err.message}`)
    } finally {
      setExportProgress(null)
      submittingRef.current = false
    }
  }, [setErrorStatus, state.annotations, controller])

  const zoomBy = useCallback((delta) => {
    setZoom((z) => Math.round(Math.max(0.1, Math.min(3, z + delta)) * 100) / 100)
  }, [])

  const zoomReset = useCallback(() => setZoom(1), [])

  const zoomFit = useCallback(() => {
    if (!mediaWidth) { return }
    const appMain = document.querySelector('.app-main')
    if (!appMain) { return }
    // Reserve room for .app-main's own padding (12px each side) plus, on the
    // vertical axis, the sticky .canvas-topbar toolbar row above the image.
    const APP_MAIN_PADDING = 24
    const TOPBAR_RESERVED_HEIGHT = 76
    const availableWidth = appMain.clientWidth - APP_MAIN_PADDING
    const availableHeight = appMain.clientHeight - TOPBAR_RESERVED_HEIGHT
    const fit = Math.min(availableWidth / mediaWidth, availableHeight / mediaHeight)
    setZoom(Math.round(Math.max(0.1, Math.min(3, fit)) * 100) / 100)
  }, [mediaWidth, mediaHeight])

  // A PDF's text layer belongs to one page, so it is fetched for the page
  // shown; an answer for a page already left behind is dropped.
  const pageShownForElements = isDocument ? doc.current : null
  useEffect(() => {
    if (pageShownForElements === null) { return }
    let current = true
    setElements([])
    fetch(`/api/pages/${pageShownForElements}/elements`)
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => { if (current) { setElements(r?.data?.elements ?? []) } })
      .catch(() => {})
    return () => { current = false }
  }, [pageShownForElements])

  // A page is rendered larger than most screens, so a document opens fitted,
  // and again whenever the page size changes (portrait after landscape).
  useEffect(() => {
    if (isDocument) { zoomFit() }
  }, [isDocument, zoomFit])

  const annotationCount = state.annotations.length
  const origin = meta?.origin

  function statusText() {
    if (exportProgress) { return `Preparing frames ${exportProgress.done}/${exportProgress.total}...` }
    if (status) { return status }
    if (video.spanComplete) { return 'Span marked. Pick a tool (or click "Pin") and click the frame to mark something in it, or click "Comment span" to comment without drawing.' }
    if (video.range.start !== null) { return 'Span started. Move to where it ends (play, scrub or use the arrows), then click "Set end here".' }
    if (isVideo) { return 'Pause on a frame and draw on it. Space plays, arrows step frames, I and O mark a span.' }
    if (activeTool === 'element') { return `Point at ${isDocument ? 'a text block or link' : 'a page element'} to see what it is, then click to select it and add a comment.` }
    if (isDocument) { return 'Draw on the page. PageUp/PageDown or [ and ] switch pages, Home and End jump to the first and last.' }
    return 'Click a mark to select it, drag to move, or press Delete to remove it.'
  }

  function pageMedia() {
    if (isVideo) { return <MediaSlot element={controller.element} label={`Recording ${meta.targetLabel ?? ''}`.trim()} /> }
    if (!isDocument) { return null }
    return (
      <PageImage
        src={doc.imageUrl} alt={`Page ${doc.current} of ${meta.targetLabel ?? 'the document'}`}
        width={mediaWidth * zoom} height={mediaHeight * zoom} loadingLabel={`Loading page ${doc.current}`}
        loading={doc.loading} onLoad={doc.markLoaded} onError={doc.reportImageError}
      />
    )
  }

  if (serverGone && !decision) {
    return (
      <div className="app-shell">
        <div className="done-screen">
          <div className="done-card">
            <div className="done-icon done-icon--disconnected">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
                <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
                <path d="M10.71 5.05A16 16 0 0122.56 9" />
                <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
                <path d="M8.53 16.11a6 6 0 016.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
            </div>
            <h1 className="done-title">Server Disconnected</h1>
            <p className="done-message">
              The server is no longer available. Your annotations have not been submitted.
            </p>
            {reconnectState === 'reconnecting' && <p className="done-hint">Attempting to reconnect...</p>}
            {reconnectState === 'failed' && <p className="done-hint">Could not reconnect to the server.</p>}
            {annotationCount > 0 && (
              <div className="done-actions">
                <p className="done-backup-info">
                  {annotationCount} annotation{annotationCount === 1 ? '' : 's'} not yet submitted.
                </p>
                <button type="button" onClick={() => setShowExport(true)} className="btn btn-feedback">
                  Export Annotations
                </button>
              </div>
            )}
          </div>
        </div>
        {showExport && (
          <ExportModal
            annotations={state.annotations}
            onImport={importAnnotations}
            onClose={() => setShowExport(false)}
          />
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  if (decision) {
    return (
      <div className="app-shell">
        <div className="done-screen">
          <div className="done-card">
            <div className={`done-icon done-icon--${decision}`}>
              {decision === 'approved' ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </div>
            <h1 className="done-title">
              {decision === 'approved'
                ? (annotationCount > 0 ? 'Approved with Notes' : 'Approved')
                : 'Feedback Submitted'}
            </h1>
            <p className="done-message">
              {decision === 'approved'
                ? (annotationCount > 0
                  ? `Approved as-is. ${annotationCount} annotation${annotationCount === 1 ? '' : 's'} passed along as notes.`
                  : `No changes requested. The ${subject} was approved as-is.`)
                : `${annotationCount} annotation${annotationCount === 1 ? '' : 's'} ${ORIGIN_LABELS[origin] ? `sent to ${ORIGIN_LABELS[origin]}` : 'submitted'}.`}
            </p>
            <p className="done-hint">
              {decision === 'feedback' && ORIGIN_LABELS[origin]
                ? `${ORIGIN_LABELS[origin]} is processing your feedback.`
                : 'You can close this tab.'}
            </p>
            <div className="done-autoclose">
              {autoCloseState.phase === 'counting' && (
                <p className="done-countdown">
                  This tab will close in <span className="done-countdown-number">{autoCloseState.remaining}</span> second{autoCloseState.remaining !== 1 ? 's' : ''}...
                </p>
              )}
              {autoCloseState.phase === 'closeFailed' && (
                <p className="done-hint">Could not close this tab automatically. Please close it manually.</p>
              )}
              {autoCloseState.phase === 'prompt' && (
                <label className="done-autoclose-prompt">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => {
                      updateSetting('autoCloseDelay', '3')
                      enableAndStart()
                    }}
                  />
                  <span>Auto-close this tab after 3 seconds</span>
                </label>
              )}
            </div>
          </div>
          <Logo className="app-logo done-logo" />
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <Logo className="app-logo" />
          <span className="version-badge">v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'}</span>
          {ORIGIN_LABELS[origin] && (
            <span className="origin-badge">{ORIGIN_LABELS[origin]}</span>
          )}
          {meta?.targetLabel && <span className="app-target">{meta.targetLabel}</span>}
        </div>
        <div className="header-right">
          <button
            type="button"
            onClick={() => submit('feedback')}
            className="btn btn-feedback"
            disabled={annotationCount === 0 || !!exportProgress}
            title={annotationCount === 0 ? 'Add annotations first' : `Submit ${annotationCount} annotation(s)`}
          >
            Feedback
            {annotationCount > 0 && <span className="btn-badge">{annotationCount}</span>}
          </button>
          <button
            type="button"
            onClick={() => submit('approve')}
            className="btn btn-approve"
            disabled={!!exportProgress}
            title={annotationCount > 0
              ? `Approve as-is and pass ${annotationCount} annotation(s) along as notes`
              : `Approve the ${subject} as-is`}
          >
            {annotationCount > 0 ? 'Approve with Notes' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="btn btn-icon"
            title="Settings"
            aria-label="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="btn btn-icon"
            title={sidebarCollapsed ? 'Show annotations' : 'Hide annotations'}
            aria-label={sidebarCollapsed ? 'Show annotations' : 'Hide annotations'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        </div>
      </header>

      <main className="app-body">
        {isDocument && <PageStrip pages={doc.pages} current={doc.current} counts={doc.counts} onSelect={goToPage} />}
        <div className="app-stage">
          <div className="app-main">
            <div className="canvas-topbar">
              <Toolbar
                activeTool={activeTool}
                onSelectTool={setActiveTool}
                elementTool={elements.length > 0}
                colorMode={settings.colorMode}
                fixedColor={settings.fixedColor}
                onChangeColorMode={(mode) => updateSetting('colorMode', mode)}
                onChangeFixedColor={(color) => updateSetting('fixedColor', color)}
              />
              <div className="canvas-topbar-end">
                {meta?.capture && (
                  <ViewportControl capture={meta.capture} busy={!!recapturing} annotationCount={state.annotations.length} onApply={recapture} />
                )}
                {isDocument && <PageNav pages={doc.pages} current={doc.current} onStep={stepPage} />}
                <ZoomControls zoom={zoom} onZoomBy={zoomBy} onZoomReset={zoomReset} onZoomFit={zoomFit} />
              </div>
            </div>
            {mediaError && <p className="media-error" role="alert">{mediaError}</p>}
            {doc.pageError && <p className="media-error" role="alert">Page {doc.current} could not be rendered: {doc.pageError}</p>}
            {recapturing && <CaptureOverlay label={recapturing} />}
            {meta && (isVideo ? controller && playerState : (isDocument ? doc.currentPage && !doc.pageError : imageUrl)) && (
              <ImageCanvas
                key={isDocument ? doc.current : 'media'}
                imageUrl={imageUrl}
                imageAlt={meta.targetLabel ? `Annotating ${meta.targetLabel}` : 'Image being annotated'}
                imageWidth={mediaWidth}
                imageHeight={mediaHeight}
                activeTool={activeTool}
                annotations={review.visible}
                media={pageMedia()}
                numberFor={isVideo || isDocument ? review.numberFor : null}
                nextNumber={review.nextNumber}
                onBeforeInteract={isVideo ? beforeCanvasInteract : null}
                describeTime={isVideo ? describeTime : null}
                voiceNotes={!!meta.voiceNotes}
                elements={elements}
                zoom={zoom}
                onZoomBy={zoomBy}
                editingAnnotationId={editingAnnotationId}
                onAddAnnotation={addAnnotation}
                onUpdateAnnotation={updateAnnotation}
                onCommitEdit={commitEditAnnotation}
                onRemoveAnnotation={removeAnnotation}
                onRequestEdit={setEditingAnnotationId}
                onUndo={undo}
                onRedo={redo}
                colorMode={settings.colorMode}
                fixedColor={settings.fixedColor}
              />
            )}
          </div>
            {meta?.sourceIsNewer && (
              <p className="document-banner" role="status">
                {meta.source} is newer than {meta.targetLabel}. The PDF may be outdated, regenerate it before reviewing.
              </p>
            )}
            {isVideo && controller && playerState && (
              <Timeline
                controller={controller}
                playerState={playerState}
                markers={video.markers}
                range={video.range}
                onMarkStart={video.markStart}
                onMarkEnd={video.markEnd}
                onClearRange={video.clearRange}
                onCommentRange={addSpanComment}
              onChangeMarkerTimes={changeMarkerTimes}
              activeTool={activeTool}
              onPickTool={setActiveTool}
              />
            )}
        </div>
        {!sidebarCollapsed && (
          <div className="panel-resize-handle" onMouseDown={handlePanelResize} />
        )}
        {!sidebarCollapsed && (
          <aside className="app-sidebar" style={{ width: panelWidth }}>
            <div className="panel-header">
              <h2>Annotations</h2>
              <span className="panel-badge">{annotationCount}</span>
              <button
                type="button"
                className="panel-icon-btn"
                onClick={addGlobalComment}
                title="Add general comment"
                aria-label="Add general comment"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </button>
              {isDocument && (
                <button
                  type="button"
                  className="panel-icon-btn"
                  onClick={addPageComment}
                  title={`Add comment for page ${doc.current}`}
                  aria-label={`Add comment for page ${doc.current}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="12" x2="12" y2="18" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </button>
              )}
              <ExportMenu
                annotations={state.annotations}
                target={isDocument && meta?.targetLabel ? `${meta.targetLabel.replace(/\.pdf$/i, '')} page ${doc.current}` : meta?.targetLabel}
                imageActions={!isVideo}
                page={isDocument ? doc.current : null}
                onOpenJson={() => setShowExport(true)}
                onDone={showToast}
              />
            </div>
            <AnnotationPanel
              annotations={review.ordered}
              onRemove={removeAnnotation}
              onEdit={editAnnotation}
              onEditGlobalComment={editGlobalComment}
              elements={elements}
              timeLabelFor={isVideo ? formatTimes : (isDocument ? pageLabel : null)}
              subject={subject}
              autoEditId={autoEditId}
              onAutoEditConsumed={clearAutoEdit}
            />
          </aside>
        )}
      </main>

      <footer className="app-status">
        <span role="status">{statusText()}</span>
        {mediaWidth && (
          <span className="image-stats">
            {isDocument && `Page ${doc.current} of ${meta.pageCount} · `}
            {mediaWidth} &times; {mediaHeight}px
          </span>
        )}
      </footer>

      {showExport && (
        <ExportModal
          annotations={state.annotations}
          onImport={importAnnotations}
          onClose={() => setShowExport(false)}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        updateSetting={updateSetting}
        resetSettings={resetSettings}
      />

      <UpdateBanner />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
