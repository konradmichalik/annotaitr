/* global __APP_VERSION__ */
import { useEffect, useReducer, useState, useCallback, useRef } from 'react'
import { annotationReducer, initialAnnotationState } from './state/annotationReducer.js'
import { createAnnotationId } from '../../shared/utils/annotationId.js'
import Toolbar from './components/Toolbar.jsx'
import ZoomControls from './components/ZoomControls.jsx'
import ImageCanvas from './components/ImageCanvas.jsx'
import AnnotationPanel from './components/AnnotationPanel.jsx'
import ExportModal from './components/ExportModal.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import { useSettings } from './hooks/useSettings.js'
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

export default function App() {
  const [state, dispatch] = useReducer(annotationReducer, initialAnnotationState)
  const [meta, setMeta] = useState(null)
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
  const { settings, updateSetting, resetSettings } = useSettings()
  const { state: autoCloseState, enableAndStart } = useAutoClose(!!decision, settings.autoCloseDelay)
  const { serverGone, reconnectState } = useServerConnection({ submitted: !!decision })
  const { width: panelWidth, handleMouseDown: handlePanelResize } = useResizablePanel('img-annotator-panel-width', 300, 1)
  const toastTimerRef = useRef(null)
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

  const addAnnotation = useCallback((partial) => {
    dispatch({
      type: 'ADD',
      annotation: { id: createAnnotationId(), createdAt: Date.now(), ...partial }
    })
  }, [])

  const addGlobalComment = useCallback(() => {
    dispatch({
      type: 'ADD',
      annotation: { id: createAnnotationId(), createdAt: Date.now(), type: 'comment', geometry: null, text: '', color: null }
    })
    setSidebarCollapsed(false)
  }, [])

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
    dispatch({ type: 'SET_ALL', annotations })
    showToast(`Imported ${annotations.length} annotation${annotations.length === 1 ? '' : 's'}`)
  }, [showToast])

  const submit = useCallback(async (endpoint) => {
    try {
      // Flush the current annotations synchronously before deciding - /api/approve
      // and /api/feedback read the server's own state.annotations, which the
      // debounced auto-save effect above may not have posted yet if the user
      // submits within 500ms of their last edit.
      await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: state.annotations })
      })
      const res = await fetch(`/api/${endpoint}`, { method: 'POST' })
      if (!res.ok) { throw new Error(`Server responded with ${res.status}`) }
      setDecision(endpoint === 'approve' ? 'approved' : 'feedback')
    } catch (err) {
      setErrorStatus(`${endpoint === 'approve' ? 'Approve' : 'Submit'} failed: ${err.message}`)
    }
  }, [setErrorStatus, state.annotations])

  const zoomBy = useCallback((delta) => {
    setZoom((z) => Math.round(Math.max(0.1, Math.min(3, z + delta)) * 100) / 100)
  }, [])

  const zoomReset = useCallback(() => setZoom(1), [])

  const zoomFit = useCallback(() => {
    if (!meta) { return }
    const appMain = document.querySelector('.app-main')
    if (!appMain) { return }
    // Reserve room for .app-main's own padding (12px each side) plus, on the
    // vertical axis, the sticky .canvas-topbar toolbar row above the image.
    const APP_MAIN_PADDING = 24
    const TOPBAR_RESERVED_HEIGHT = 76
    const availableWidth = appMain.clientWidth - APP_MAIN_PADDING
    const availableHeight = appMain.clientHeight - TOPBAR_RESERVED_HEIGHT
    const fit = Math.min(availableWidth / meta.width, availableHeight / meta.height)
    setZoom(Math.round(Math.max(0.1, Math.min(3, fit)) * 100) / 100)
  }, [meta])

  const annotationCount = state.annotations.length
  const origin = meta?.origin

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
                  : 'No changes requested. The image was approved as-is.')
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
            disabled={annotationCount === 0}
            title={annotationCount === 0 ? 'Add annotations first' : `Submit ${annotationCount} annotation(s)`}
          >
            Feedback
            {annotationCount > 0 && <span className="btn-badge">{annotationCount}</span>}
          </button>
          <button
            type="button"
            onClick={() => submit('approve')}
            className="btn btn-approve"
            title={annotationCount > 0
              ? `Approve as-is and pass ${annotationCount} annotation(s) along as notes`
              : 'Approve the image as-is'}
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
        <div className="app-main">
          <div className="canvas-topbar">
            <Toolbar
              activeTool={activeTool}
              onSelectTool={setActiveTool}
              colorMode={settings.colorMode}
              fixedColor={settings.fixedColor}
              onChangeColorMode={(mode) => updateSetting('colorMode', mode)}
              onChangeFixedColor={(color) => updateSetting('fixedColor', color)}
            />
            <ZoomControls zoom={zoom} onZoomBy={zoomBy} onZoomReset={zoomReset} onZoomFit={zoomFit} />
          </div>
          {imageUrl && meta && (
            <ImageCanvas
              imageUrl={imageUrl}
              imageAlt={meta.targetLabel ? `Annotating ${meta.targetLabel}` : 'Image being annotated'}
              imageWidth={meta.width}
              imageHeight={meta.height}
              activeTool={activeTool}
              annotations={state.annotations}
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
              <button
                type="button"
                className="panel-icon-btn"
                onClick={() => setShowExport(true)}
                title="Export / Import"
                aria-label="Export / Import"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </div>
            <AnnotationPanel
              annotations={state.annotations}
              onRemove={removeAnnotation}
              onEdit={setEditingAnnotationId}
              onEditGlobalComment={editGlobalComment}
            />
          </aside>
        )}
      </main>

      <footer className="app-status">
        <span>{status || 'Click a mark to select it, drag to move, or press Delete to remove it.'}</span>
        {meta && <span className="image-stats">{meta.width} &times; {meta.height}px</span>}
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
