import { useEffect, useReducer, useState, useCallback, useRef, useMemo } from 'react'
import { annotationReducer, initialAnnotationState, upcomingNumber } from './state/annotationReducer.js'
import { createAnnotationId } from '../../shared/utils/annotationId.js'
import { intentOf } from '../../shared/utils/intents.js'
import Toolbar, { offeredTools } from './components/Toolbar.jsx'
import ZoomControls from './components/ZoomControls.jsx'
import ViewportControl from './components/ViewportControl.jsx'
import CaptureOverlay from './components/CaptureOverlay.jsx'
import ImageCanvas from './components/ImageCanvas.jsx'
import AnnotationPanel from './components/AnnotationPanel.jsx'
import ExportModal from './components/ExportModal.jsx'
import ExportMenu from './components/ExportMenu.jsx'
import ToolHelp from './components/ToolHelp.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import Timeline from './video/Timeline.jsx'
import MediaSlot from './video/MediaSlot.jsx'
import PageStrip from './document/PageStrip.jsx'
import PageNav from './document/PageNav.jsx'
import PageImage from './document/PageImage.jsx'
import { usePreviousRound } from './threads/usePreviousRound.js'
import { useThreadPopover } from './threads/useThreadPopover.js'
import UnansweredQuestions from './threads/UnansweredQuestions.jsx'
import PreviousRoundPanel from './threads/PreviousRoundPanel.jsx'
import ThreadPopover from './threads/ThreadPopover.jsx'
import { placedThreads, threadPageCounts, hasMark, pendingReplyCount, openQuestions } from './threads/threadView.js'
import { useSettings } from './hooks/useSettings.js'
import { useToolShortcuts } from './hooks/useToolShortcuts.js'
import { useMediaPlayer } from './video/useMediaPlayer.js'
import { useVideoReview } from './video/useVideoReview.js'
import { useTimelineShortcuts } from './video/useTimelineShortcuts.js'
import { useDocumentReview } from './document/useDocumentReview.js'
import { useDocumentShortcuts } from './document/useDocumentShortcuts.js'
import { pageLabel, isPaged, orderDocumentAnnotations } from './document/documentPages.js'
import { uploadFrames } from './utils/uploadFrames.js'
import { formatTimes, orderVideoAnnotations } from './video/timeline.js'
import { readError } from './utils/readError.js'
import { useAutoClose } from '../../shared/hooks/useAutoClose.js'
import { useServerConnection } from '../../shared/hooks/useServerConnection.js'
import { useResizablePanel } from '../../shared/hooks/useResizablePanel.js'
import { UpdateBanner } from '../../shared/components/UpdateBanner.jsx'
import { AppHeader } from '../../shared/components/AppHeader.jsx'
import { DecisionDialog } from '../../shared/components/DecisionDialog.jsx'
import { useDecisionShortcut } from '../../shared/hooks/useDecisionShortcut.js'
import { useShortcutListKey } from '../../shared/hooks/useShortcutListKey.js'
import { applySummary, plural } from '../../shared/utils/decision.js'
import { sourceKind, targetFacts } from './utils/headerSource.js'
import ImageDoneScreen from './components/ImageDoneScreen.jsx'
import { doneOutcome } from '../../shared/utils/done.js'
import { getItem, setItem } from '../../shared/utils/storage.js'
import { PanelSwitch } from '../../shared/components/PanelSwitch.jsx'
import { GeneralCommentRow } from '../../shared/components/GeneralCommentRow.jsx'
import { useGeneralComment } from '../../shared/hooks/useGeneralComment.js'

// The general comment has no shape, page or time: it is about the whole target.
const isGeneralComment = (a) => a.type === 'comment' && !a.geometry && typeof a.page !== 'number' && typeof a.time !== 'number'

function createGeneralComment(text) {
  return { id: createAnnotationId(), createdAt: Date.now(), type: 'comment', geometry: null, text, color: null }
}

const EMPTY_KEYS = [
  { key: 'R', label: 'Box around an area' },
  { key: 'A', label: 'Arrow to point at something' },
  { key: 'C', label: 'Pin a comment to a spot' }
]

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
  const [capturedElements, setElements] = useState([])
  // What is being captured right now ("Tablet 768×1024"), or null.
  const [recapturing, setRecapturing] = useState(null)
  const [imageUrl, setImageUrl] = useState(null)
  const [decision, setDecision] = useState(null)
  const [activeTool, setActiveTool] = useState('select')
  const [showExport, setShowExport] = useState(false)
  // The decision dialog, with the option it opens on (null: the default for the state).
  const [decisionDialog, setDecisionDialog] = useState(null)
  const primaryRef = useRef(null)
  const [editingAnnotationId, setEditingAnnotationId] = useState(null)
  // The mark selected on the canvas, whose card the panel selects and scrolls to.
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null)
  const [panelTab, setPanelTab] = useState('round')
  const [zoom, setZoom] = useState(1)
  const [settingsTab, setSettingsTab] = useState(null)
  const settingsOpen = settingsTab !== null
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
  // Videos and PDFs draw last round in their own views, a still image has a single one.
  const isStill = !!meta && !isVideo && !isDocument
  // A video is asked only once its duration is known, so marks past the end arrive as orphans.
  const previous = usePreviousRound({
    ready: isStill || isDocument || (isVideo && !!controller),
    duration: isVideo ? controller?.duration : undefined,
    captureKey: imageUrl
  })
  const previousView = isVideo
    ? { kind: 'video', time: playerState?.currentTime ?? 0, tolerance: (playerState?.frameDuration ?? 1 / 30) / 2 }
    : (isDocument ? { kind: 'document', page: doc.current } : { kind: 'still' })
  const previousThreads = placedThreads(previous.threads, previousView)
  const seekTo = isDocument ? doc.seekTo : video.seekTo
  const {
    showPrevious, openThreadHandle, entryThread,
    openCanvasThread, showThreadFrom, showTimelineThread, togglePrevious, closeThread
  } = useThreadPopover({ previousThreads, seekTo })
  // Looked up in the current threads so a reload (a sent or removed reply) reaches the open popover.
  const entryPopoverThread = entryThread && previous.threads.find((t) => t.handle === entryThread.handle)
  const markedThreads = previous.threads.filter(hasMark)
  const previousPageCounts = isDocument && showPrevious ? threadPageCounts(markedThreads) : undefined
  const timelineThreads = isVideo && showPrevious ? previous.threads.filter((t) => t.anchor !== 'orphan' && typeof t.annotation.time === 'number') : []
  // A PDF's text layer is per page; a captured web page has one element map.
  const elements = isDocument ? doc.elements : capturedElements
  const words = isDocument ? doc.words : []
  // While a page's text is still on its way the Element and Text tools stay
  // offered, so the toolbar does not shift on every page; once it is known
  // that a page has none (a scan), a tool that needs it falls back to Select.
  const textPending = isDocument && !doc.textLoaded
  const offersElementTool = elements.length > 0 || textPending
  const offersTextTool = words.length > 0 || textPending
  const tools = useMemo(() => offeredTools({ elementTool: offersElementTool, textTool: offersTextTool }), [offersElementTool, offersTextTool])
  useEffect(() => {
    const unavailable = (activeTool === 'element' && !offersElementTool) || (activeTool === 'text' && !offersTextTool)
    if (unavailable) { setActiveTool('select') }
  }, [activeTool, offersElementTool, offersTextTool])
  const mediaWidth = isVideo ? controller?.width : (isDocument ? doc.currentPage?.width : meta?.width)
  const mediaHeight = isVideo ? controller?.height : (isDocument ? doc.currentPage?.height : meta?.height)
  const subject = isVideo ? 'recording' : (isDocument ? 'document' : 'image')
  const { state: autoCloseState, keepOpen } = useAutoClose(!!decision, settings.autoCloseDelay)
  const { serverGone, reconnectState } = useServerConnection({ submitted: !!decision })
  const { width: panelWidth, handleMouseDown: handlePanelResize } = useResizablePanel('img-annotator-panel-width', 340, 1)
  const toastTimerRef = useRef(null)
  // Guards submit() synchronously: the buttons only disable once frame
  // export reports progress, which is too late to stop a double click.
  const submittingRef = useRef(false)
  // The annotation as it was when a marker drag began, so the whole drag
  // becomes one undo step.
  const markerDragRef = useRef(null)
  // The image last shown, still loaded after the canvas is gone, for Save annotated image when the session ends.
  const lastImageRef = useRef(null)
  const keepImage = useCallback((element) => { if (element) { lastImageRef.current = element } }, [])
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

  const pageShown = doc.current
  const addPageComment = useCallback(() => addComment({ page: pageShown }), [addComment, pageShown])
  const clearAutoEdit = useCallback(() => setAutoEditId(null), [])

  const addSpanComment = useCallback(() => {
    addComment({ time: range.start, endTime: range.end })
    clearRange()
  }, [addComment, range, clearRange])

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

  const generalComment = state.annotations.find(isGeneralComment) ?? null
  const saveGeneralComment = useCallback((text) => {
    if (!generalComment) {
      if (text) { dispatch({ type: 'ADD', annotation: createGeneralComment(text) }) }
      return
    }
    if (text) {
      dispatch({ type: 'EDIT', id: generalComment.id, before: generalComment, after: { ...generalComment, text } })
    } else {
      dispatch({ type: 'REMOVE', id: generalComment.id })
    }
  }, [generalComment])
  const generalEditor = useGeneralComment({
    text: generalComment?.text || null,
    onSave: saveGeneralComment,
    disabled: sidebarCollapsed || settingsOpen || showExport || !!decisionDialog
  })

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
    // An export from before notes kept their numbers is numbered the way that version numbered it.
    const order = isVideo ? orderVideoAnnotations : (isDocument ? orderDocumentAnnotations : undefined)
    dispatch({ type: 'SET_ALL', annotations, order })
    showToast(`Imported ${annotations.length} annotation${annotations.length === 1 ? '' : 's'}`)
  }, [showToast, isVideo, isDocument, doc.pages, setErrorStatus])

  const submit = useCallback(async (endpoint, annotations) => {
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
        body: JSON.stringify({ annotations })
      })
      // Deciding on whatever the server last accepted would drop or alter
      // annotations without the reviewer noticing.
      if (!flush.ok) { throw new Error(`annotations were not saved: ${await readError(flush)}`) }
      // A recording's output is built from frames only the browser can
      // decode, so they are grabbed and uploaded before the decision.
      if (controller && annotations.length > 0) {
        controller.pause()
        await uploadFrames(controller, (done, total) => setExportProgress({ done, total }))
      }
      const res = await fetch(`/api/${endpoint}`, { method: 'POST' })
      if (!res.ok) { throw new Error(await readError(res)) }
      // The done screen counts what went out: a summary may have been added, an approval may have discarded the notes.
      dispatch({ type: 'SET_ALL', annotations })
      setDecision(endpoint === 'approve' ? 'approved' : 'feedback')
    } catch (err) {
      setErrorStatus(`${endpoint === 'approve' ? 'Approve' : 'Submit'} failed: ${err.message}`)
    } finally {
      setExportProgress(null)
      submittingRef.current = false
    }
  }, [setErrorStatus, controller])

  const unanswered = openQuestions(previous.threads)
  // `summary` comes from the decision dialog and becomes the general comment; null keeps the notes as they are.
  const finish = ({ choice, summary = null }) => {
    const withSummary = summary === null
      ? state.annotations
      : applySummary(state.annotations, summary, { isGeneral: isGeneralComment, create: createGeneralComment })
    submit(choice === 'feedback' ? 'feedback' : 'approve', choice === 'approve' ? [] : withSummary)
  }
  // While the agent waits for answers, the main button opens the dialog with the open questions first,
  // so they are seen before feedback or an approval ends the wait.
  const decidePrimary = (choice) => {
    if (unanswered.length > 0) {
      setDecisionDialog({ choice })
      return
    }
    finish({ choice })
  }
  const finishFromDialog = (result) => {
    setDecisionDialog(null)
    finish(result)
  }
  const answerQuestions = () => {
    setDecisionDialog(null)
    const [thread] = unanswered
    showThreadFrom(thread, primaryRef.current, 'bottom')
  }
  const openDecision = useCallback(() => setDecisionDialog({ choice: null }), [])
  const closeDecision = useCallback(() => setDecisionDialog(null), [])
  useDecisionShortcut(openDecision, !decision && !settingsOpen && !showExport && !exportProgress)
  const openShortcuts = useCallback(() => setSettingsTab('shortcuts'), [])
  useShortcutListKey(openShortcuts, !decision && !settingsOpen && !showExport && !decisionDialog && !exportProgress)
  useToolShortcuts({ tools, disabled: settingsOpen || showExport || !!decisionDialog || !!decision || !!exportProgress, onSelect: setActiveTool })

  const zoomBy = useCallback((delta) => {
    setZoom((z) => Math.round(Math.max(0.1, Math.min(3, z + delta)) * 100) / 100)
  }, [])

  const zoomReset = useCallback(() => setZoom(1), [])

  const zoomFit = useCallback(() => {
    if (!mediaWidth) { return }
    const appMain = document.querySelector('.app-main')
    if (!appMain) { return }
    // Reserve .app-main's own padding, which keeps the floating controls
    // above and the dock below clear of the image.
    const style = getComputedStyle(appMain)
    const availableWidth = appMain.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const availableHeight = appMain.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    const fit = Math.min(availableWidth / mediaWidth, availableHeight / mediaHeight)
    setZoom(Math.round(Math.max(0.1, Math.min(3, fit)) * 100) / 100)
  }, [mediaWidth, mediaHeight])

  // A page is rendered larger than most screens, so a document opens fitted,
  // and again whenever the page size changes (portrait after landscape).
  useEffect(() => {
    if (isDocument) { zoomFit() }
  }, [isDocument, zoomFit])

  const annotationCount = state.annotations.length
  const replyCount = pendingReplyCount(previous.threads)
  const decisionItemCount = annotationCount + replyCount
  const cardCount = annotationCount - (generalComment ? 1 : 0)
  // A round that opens on replies shows them first; a new note brings its card into view.
  const hasThreads = previous.threads.length > 0
  const cardCountRef = useRef(cardCount)
  useEffect(() => {
    if (hasThreads && cardCountRef.current === 0) { setPanelTab('replies') }
  }, [hasThreads])
  useEffect(() => {
    if (cardCount > cardCountRef.current) { setPanelTab('round') }
    cardCountRef.current = cardCount
  }, [cardCount])
  const notesTitle = [annotationCount > 0 && `${annotationCount} annotation${annotationCount === 1 ? '' : 's'}`, replyCount > 0 && `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`].filter(Boolean).join(' and ')
  const origin = meta?.origin
  const source = sourceKind(meta)
  const facts = meta ? targetFacts({
    kind: source,
    pageCount: meta.pageCount,
    width: isVideo ? controller?.width : meta.width,
    height: isVideo ? controller?.height : meta.height,
    duration: controller?.duration
  }) : null

  function statusHelp() {
    if (exportProgress) { return `Preparing frames ${exportProgress.done}/${exportProgress.total}...` }
    if (status) { return status }
    if (video.spanComplete) { return 'Span marked. Pick a tool and click the frame to mark something in it, or click "Comment span" to comment without drawing.' }
    if (video.range.start !== null) { return 'Span started. Move to where it ends (play, scrub or use the arrows), then click "Set end here".' }
    return settings.toolHints ? <ToolHelp tool={activeTool} isVideo={isVideo} isDocument={isDocument} /> : null
  }

  function pageMedia() {
    if (isVideo) { return <MediaSlot element={controller.element} label={`Recording ${meta.targetLabel ?? ''}`.trim()} /> }
    if (!isDocument) { return null }
    return (
      <PageImage
        src={doc.imageUrl} alt={`Page ${doc.current} of ${meta.targetLabel ?? 'the document'}`}
        width={mediaWidth * zoom} height={mediaHeight * zoom} loadingLabel={`Loading page ${doc.current}`}
        loading={doc.loading} onLoad={doc.markLoaded} onError={doc.reportImageError} imageRef={keepImage}
      />
    )
  }

  const outcome = doneOutcome({ decision, serverGone, notes: annotationCount, replies: replyCount })
  if (outcome) {
    return (
      <div className="app-shell">
        <ImageDoneScreen
          outcome={outcome}
          annotations={outcome === 'approved' ? [] : state.annotations}
          replies={replyCount}
          origin={origin}
          target={meta?.targetLabel}
          locate={isVideo ? formatTimes : (isDocument ? pageLabel : null)}
          snapshot={isVideo || !mediaWidth ? null : {
            image: lastImageRef.current, width: mediaWidth, height: mediaHeight, marks: review.visible, noun: isDocument ? 'page' : 'image'
          }}
          countdown={autoCloseState}
          onKeepOpen={keepOpen}
          reconnecting={reconnectState === 'reconnecting'}
        />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppHeader
        source={source}
        target={meta?.targetLabel}
        facts={facts}
        round={previous.round === null ? null : previous.round + 1}
        origin={origin}
        onOpenShortcuts={openShortcuts}
        onOpenSettings={() => setSettingsTab('general')}
        panelCollapsed={sidebarCollapsed}
        onTogglePanel={() => setSidebarCollapsed((prev) => !prev)}
        decision={{
          itemCount: decisionItemCount,
          title: decisionItemCount > 0 ? `Submit ${notesTitle}` : `Approve the ${subject} as-is`,
          busy: !!exportProgress,
          dialogOpen: !!decisionDialog,
          primaryRef,
          onPrimary: decidePrimary,
          onOpenDialog: openDecision
        }}
      />

      <main className="app-body">
        {isDocument && <PageStrip pages={doc.pages} current={doc.current} counts={doc.counts} previousCounts={previousPageCounts} onSelect={goToPage} />}
        <div className="app-stage">
          <div className="work-area">
          {meta?.capture && (
            <div className="floating floating--top-left">
              <ViewportControl capture={meta.capture} busy={!!recapturing} annotationCount={state.annotations.length} onApply={recapture} />
            </div>
          )}
          <div className="floating floating--top-right">
            {isDocument && <PageNav pages={doc.pages} current={doc.current} pageCount={meta.pageCount} onStep={stepPage} />}
            <ZoomControls zoom={zoom} onZoomBy={zoomBy} onZoomReset={zoomReset} onZoomFit={zoomFit} />
          </div>
          <div className="floating floating--bottom">
            <Toolbar
              activeTool={activeTool}
              onSelectTool={setActiveTool}
              tools={tools}
              colorMode={settings.colorMode}
              fixedColor={settings.fixedColor}
              onChangeColorMode={(mode) => updateSetting('colorMode', mode)}
              onChangeFixedColor={(color) => updateSetting('fixedColor', color)}
              onUndo={undo}
              canUndo={state.history.length > 0}
            />
          </div>
          <div className="app-main canvas-surface">
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
                nextNumber={upcomingNumber(state)}
                onBeforeInteract={isVideo ? beforeCanvasInteract : null}
                describeTime={isVideo ? describeTime : null}
                voiceNotes={!!meta.voiceNotes}
                elements={elements}
                words={words}
                zoom={zoom}
                onZoomBy={zoomBy}
                editingAnnotationId={editingAnnotationId}
                onAddAnnotation={addAnnotation}
                onUpdateAnnotation={updateAnnotation}
                onCommitEdit={commitEditAnnotation}
                onRemoveAnnotation={removeAnnotation}
                onRequestEdit={setEditingAnnotationId}
                onSelectionChange={setSelectedAnnotationId}
                onUndo={undo}
                onRedo={redo}
                colorMode={settings.colorMode}
                fixedColor={settings.fixedColor}
                newIntent={settings.defaultIntent}
                imageRef={keepImage}
                previousThreads={previousThreads}
                previousRound={previous.round}
                onReloadThreads={previous.reload}
                showPrevious={showPrevious}
                openThreadHandle={openThreadHandle}
                onOpenThread={openCanvasThread}
                onCloseThread={closeThread}
              />
            )}
          </div>
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
              previousThreads={timelineThreads}
              previousRound={previous.round}
              onShowThread={showTimelineThread}
              />
            )}
        </div>
        {!sidebarCollapsed && (
          <div className="panel-splitter" onMouseDown={handlePanelResize} />
        )}
        {!sidebarCollapsed && (
          <aside className="app-sidebar" style={{ width: panelWidth }}>
            <div className="panel-header">
              <h2>Feedback</h2>
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
            {previous.threads.length > 0 && (
              <PanelSwitch
                label="Feedback"
                panelId="feedback-tabpanel"
                value={panelTab}
                onChange={setPanelTab}
                options={[
                  { id: 'round', label: `This round · ${annotationCount}` },
                  { id: 'replies', label: `Replies · ${previous.threads.length}` }
                ]}
              />
            )}
            {entryPopoverThread && (
              <ThreadPopover key={entryPopoverThread.handle} thread={entryPopoverThread} round={previous.round} anchorPoint={entryThread.anchorPoint} onClose={closeThread} onReload={previous.reload} />
            )}
            <div
              className="panel-body"
              id="feedback-tabpanel"
              {...(previous.threads.length > 0 ? { role: 'tabpanel', 'aria-labelledby': `panel-tab-${panelTab}` } : {})}
            >
              {previous.threads.length > 0 && panelTab === 'replies' ? (
                <PreviousRoundPanel round={previous.round} threads={previous.threads} showOnImage={showPrevious} onToggleShowOnImage={togglePrevious} onShow={(thread, button) => showThreadFrom(thread, button, 'bottom')} />
              ) : (
                <AnnotationPanel
                  annotations={review.ordered}
                  hidden={generalComment}
                  generalEditor={generalEditor}
                  onRemove={removeAnnotation}
                  onEdit={editAnnotation}
                  onEditComment={editGlobalComment}
                  elements={elements}
                  timeLabelFor={isVideo ? formatTimes : (isDocument ? pageLabel : null)}
                  subject={subject}
                  autoEditId={autoEditId}
                  onAutoEditConsumed={clearAutoEdit}
                  selectedId={selectedAnnotationId}
                  emptyKeys={EMPTY_KEYS}
                  approves={decisionItemCount === 0}
                />
              )}
            </div>
            <GeneralCommentRow editor={generalEditor} />
          </aside>
        )}
      </main>

      <footer className="app-status">
        <span className="status-help" role="status">{statusHelp()}</span>
        {mediaWidth && (
          <span className="status-facts">
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

      {decisionDialog && (
        <DecisionDialog
          origin={origin}
          noteIntents={state.annotations.filter((a) => a !== generalComment).map(intentOf)}
          generalText={generalComment ? generalComment.text : null}
          replies={replyCount}
          info={replyCount > 0 ? `${plural(replyCount, 'pending reply', 'pending replies')} to round ${previous.round} ${replyCount === 1 ? 'goes' : 'go'} out with this.` : null}
          initialChoice={decisionDialog.choice}
          warning={unanswered.length > 0 && <UnansweredQuestions threads={unanswered} round={previous.round} onAnswer={answerQuestions} />}
          busy={!!exportProgress}
          onSubmit={finishFromDialog}
          onClose={closeDecision}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        initialSection={settingsTab ?? undefined}
        source={source}
        onClose={() => setSettingsTab(null)}
        settings={settings}
        updateSetting={updateSetting}
        resetSettings={resetSettings}
      />

      <UpdateBanner />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
