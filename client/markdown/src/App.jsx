/* global __APP_VERSION__ */
import { useState, useEffect, useRef, useCallback, useReducer, useMemo } from 'react'
import { parseMarkdownToBlocks } from './utils/parser.js'
import { Viewer } from './components/Viewer/Viewer.jsx'
import { SourceView } from './components/Viewer/SourceView.jsx'
import { AnnotationPanel } from './components/AnnotationPanel.jsx'
import { TableOfContents } from './components/TableOfContents.jsx'
import { ExportModal } from './components/ExportModal.jsx'
import { FeedbackNotesModal } from './components/FeedbackNotesModal.jsx'
import { validateAnnotationImport } from './utils/export.js'
import { getTextStats } from './utils/textStats.js'
import { createAnnotationId } from '../../shared/utils/annotationId.js'
import { UpdateBanner } from '../../shared/components/UpdateBanner.jsx'
import { FileTabsBar } from './components/FileTabsBar.jsx'
import { initialAnnotationState } from './state/annotationReducer.js'
import { filesReducer } from './state/filesReducer.js'
import { useAutoClose } from '../../shared/hooks/useAutoClose.js'
import { useResizablePanel } from '../../shared/hooks/useResizablePanel.js'
import { useServerConnection } from '../../shared/hooks/useServerConnection.js'
import { useAnnotationDraft } from './hooks/useAnnotationDraft.js'
import { useSettings } from './hooks/useSettings.js'
import { useCrossFileSearch } from './hooks/useCrossFileSearch.js'
import { SettingsModal } from './components/SettingsModal.jsx'
import { Logo } from '../../shared/components/Logo.jsx'
import { getItem, setItem } from '../../shared/utils/storage.js'
import 'katex/dist/katex.min.css'
import './styles.css'

function getInitialSidebarCollapsed() {
  return getItem('md-annotator-sidebar-collapsed') === 'true'
}

function getInitialTocCollapsed() {
  return getItem('md-annotator-toc-collapsed') === 'true'
}

function FileStats({ content }) {
  const { lines, words, readingTime } = getTextStats(content)
  return (
    <span className="file-stats">
      {lines} lines &middot; {words} words &middot; ~{readingTime} min read
    </span>
  )
}

const ORIGIN_LABELS = {
  'claude-code': 'Claude Code',
  'opencode': 'OpenCode',
  'vibe': 'Mistral Vibe',
}

export default function App() {
  const [files, filesDispatch] = useReducer(filesReducer, [])
  const [activeFileIndex, setActiveFileIndex] = useState(0)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null)
  const [status, setStatus] = useState('Loading...')
  const [submitted, setSubmitted] = useState(false)
  const [decision, setDecision] = useState(null) // 'approved' | 'feedback'
  const [approvedNoteCount, setApprovedNoteCount] = useState(0)
  const { settings, updateSetting, resetSettings } = useSettings()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed)
  const [tocCollapsed, setTocCollapsed] = useState(getInitialTocCollapsed)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [notesModalOpen, setNotesModalOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [origin, setOrigin] = useState('cli')
  const [serverConfig, setServerConfig] = useState({})
  const [pinpointMode, setPinpointMode] = useState(() => settings.defaultMode === 'pinpoint')
  const [viewMode, setViewMode] = useState('preview') // 'preview' | 'source'
  const [shiftHeld, setShiftHeld] = useState(false)
  const viewerRef = useRef(null)
  const prevLastActionRef = useRef(null)
  const toastTimerRef = useRef(null)
  const notesShownRef = useRef(false)
  const errorTimerRef = useRef(null)
  const filesRef = useRef(files)
  filesRef.current = files

  const setErrorStatus = useCallback((msg) => {
    setStatus(msg)
    if (errorTimerRef.current) {clearTimeout(errorTimerRef.current)}
    errorTimerRef.current = setTimeout(() => {
      setStatus(prev => (prev === msg ? '' : prev))
      errorTimerRef.current = null
    }, 5000)
  }, [])

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) {clearTimeout(errorTimerRef.current)}
    }
  }, [])

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) {clearTimeout(toastTimerRef.current)}
    setToast(message)
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  // Derived state from active file
  const activeFile = files[activeFileIndex] || null
  // Plain-text files (YAML, JSON, logs, ...) have no meaningful rendered view
  const isPlainTextFile = activeFile?.isPlainText || false
  const effectiveViewMode = isPlainTextFile ? 'source' : viewMode
  const activeAnnState = activeFile?.annState || initialAnnotationState
  const { annotations } = activeAnnState
  const blocks = activeFile?.blocks || []
  const filePath = activeFile?.path || ''
  const totalAnnotationCount = files.reduce((sum, f) =>
    sum + f.annState.annotations.filter(a => a.type !== 'NOTES').length, 0
  )
  const notesGroups = files
    .map(f => ({
      filePath: f.path,
      notes: f.annState.annotations.filter(a => a.type === 'NOTES')
    }))
    .filter(g => g.notes.length > 0)

  // Draft auto-save and restore
  const { draftBanner, restoreDraft, dismissDraft } = useAnnotationDraft({
    annotations,
    contentHash: activeFile?.contentHash,
    submitted,
    enabled: settings.autoSaveDrafts,
  })

  // Cross-file search (only active for multi-file sessions)
  const crossFileSearchState = useCrossFileSearch(files)
  const isMultiFile = files.length > 1

  const handleCrossFileSelectResult = useCallback((fileIndex) => {
    if (fileIndex !== activeFileIndex) {
      setActiveFileIndex(fileIndex)
    }
  }, [activeFileIndex])

  const crossFileSearchProps = useMemo(() => {
    if (!isMultiFile) { return null }
    // Reorder results so the active file's matches appear first
    const reordered = [...crossFileSearchState.results].sort((a, b) => {
      if (a.fileIndex === activeFileIndex) { return -1 }
      if (b.fileIndex === activeFileIndex) { return 1 }
      return a.fileIndex - b.fileIndex
    })
    return {
      ...crossFileSearchState,
      results: reordered,
      onSelectResult: handleCrossFileSelectResult,
    }
  }, [isMultiFile, crossFileSearchState, handleCrossFileSelectResult, activeFileIndex])

  // Dispatch annotation actions to active file
  const annDispatch = useCallback((annAction) => {
    filesDispatch({ type: 'ANN', fileIndex: activeFileIndex, annAction })
  }, [activeFileIndex])

  // Handle DOM highlight side effects based on reducer lastAction
  // Element annotations (image/diagram) have no web-highlighter DOM, so skip them
  useEffect(() => {
    const { lastAction } = activeAnnState
    if (!lastAction || lastAction === prevLastActionRef.current) {return}
    prevLastActionRef.current = lastAction

    const hasNoHighlighter = (ann) =>
      ann?.targetType === 'image' || ann?.targetType === 'diagram' ||
      ann?.targetType === 'global'

    if (lastAction.type === 'delete') {
      if (!hasNoHighlighter(lastAction.annotation)) {
        viewerRef.current?.removeHighlight(lastAction.annotation.id)
      }
    } else if (lastAction.type === 'edit') {
      if (!hasNoHighlighter(lastAction.updated)) {
        viewerRef.current?.updateHighlightType(lastAction.updated.id, lastAction.updated.type)
      }
    } else if (lastAction.type === 'undo') {
      const { entry } = lastAction
      if (hasNoHighlighter(entry.annotation)) {/* no-op for element annotations */}
      else if (entry.action === 'add') {
        viewerRef.current?.removeHighlight(entry.annotation.id)
      } else if (entry.action === 'delete') {
        viewerRef.current?.restoreHighlight(entry.annotation)
      } else if (entry.action === 'edit') {
        viewerRef.current?.updateHighlightType(entry.annotation.id, entry.annotation.type)
      }
    } else if (lastAction.type === 'redo') {
      const { entry } = lastAction
      if (hasNoHighlighter(entry.annotation)) {/* no-op for element annotations */}
      else if (entry.action === 'add') {
        viewerRef.current?.restoreHighlight(entry.annotation)
      } else if (entry.action === 'delete') {
        viewerRef.current?.removeHighlight(entry.annotation.id)
      } else if (entry.action === 'edit') {
        viewerRef.current?.updateHighlightType(entry.updated.id, entry.updated.type)
      }
    }
  }, [activeAnnState])

  useEffect(() => {
    setItem('md-annotator-sidebar-collapsed', sidebarCollapsed)
  }, [sidebarCollapsed])

  useEffect(() => {
    setItem('md-annotator-toc-collapsed', tocCollapsed)
  }, [tocCollapsed])

  // Hold Shift to temporarily toggle pinpoint mode
  // (Alt is reserved for insertion mode)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Shift' || e.repeat) {return}
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'textarea' || tag === 'input') {return}
      if (document.querySelector('.annotation-toolbar, .comment-popover')) {return}
      setShiftHeld(true)
    }
    const handleKeyUp = (e) => {
      if (e.key !== 'Shift') {return}
      setShiftHeld(false)
    }
    const handleBlur = () => setShiftHeld(false)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  const effectivePinpointMode = shiftHeld ? !pinpointMode : pinpointMode

  const toggleToc = useCallback(() => {
    setTocCollapsed(prev => !prev)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev)
  }, [])

  const loadFiles = useCallback(async () => {
    try {
      setStatus('Loading...')

      // Try multi-file endpoint first
      const res = await fetch('/api/files')
      const json = await res.json()

      if (json.success) {
        const loadedFiles = json.data.files.map(f => ({
          index: f.index,
          path: f.path,
          content: f.content,
          blocks: parseMarkdownToBlocks(f.content, { allowFrontmatter: !f.isPlainText }),
          contentHash: f.contentHash,
          hashMismatch: f.hashMismatch || false,
          isPlainText: f.isPlainText || false
        }))
        filesDispatch({ type: 'INIT_FILES', files: loadedFiles })
        setOrigin(json.data.origin || 'cli')
        if (json.data.config) { setServerConfig(json.data.config) }
        setStatus('Select text to annotate, then Approve or Submit Feedback.')
        return loadedFiles
      } else {
        setErrorStatus('Error: ' + json.error)
      }
    } catch (err) {
      setErrorStatus('Error: ' + err.message)
    }
    return null
  }, [setErrorStatus])

  const loadAnnotations = useCallback(async (loadedFiles) => {
    for (let i = 0; i < loadedFiles.length; i++) {
      try {
        const res = await fetch(`/api/annotations?fileIndex=${i}`)
        const json = await res.json()
        if (json.success && json.data.annotations.length > 0) {
          if (json.data.contentHash === loadedFiles[i].contentHash) {
            filesDispatch({
              type: 'ANN',
              fileIndex: i,
              annAction: { type: 'RESTORE', annotations: json.data.annotations }
            })
            // Restore highlights only for initial active file
            if (i === 0) {
              setTimeout(() => {
                viewerRef.current?.restoreHighlights(json.data.annotations)
              }, 100)
            }
          } else {
            filesDispatch({
              type: 'UPDATE_FILE',
              fileIndex: i,
              updates: { hashMismatch: true }
            })
          }
        }
      } catch (_err) {
        // Silent failure - persistence is best-effort
      }
    }
  }, [])

  useEffect(() => {
    loadFiles().then(loaded => {
      if (loaded) {loadAnnotations(loaded)}
    })
  }, [loadFiles, loadAnnotations])

  // Show feedback notes modal once after annotations are loaded
  useEffect(() => {
    if (notesShownRef.current || files.length === 0) {return}
    const hasNotes = files.some(f =>
      f.annState.annotations.some(a => a.type === 'NOTES')
    )
    if (hasNotes) {
      notesShownRef.current = true
      setNotesModalOpen(true)
    }
  }, [files])

  // Restore highlights when switching files or view mode (Viewer/SourceView remounts via key)
  const prevFileIndexRef = useRef(0)
  const prevViewModeRef = useRef(effectiveViewMode)
  useEffect(() => {
    const fileChanged = prevFileIndexRef.current !== activeFileIndex
    const viewChanged = prevViewModeRef.current !== effectiveViewMode
    if (!fileChanged && !viewChanged) {return}
    prevFileIndexRef.current = activeFileIndex
    prevViewModeRef.current = effectiveViewMode
    if (fileChanged) {
      prevLastActionRef.current = null
      setSelectedAnnotationId(null)
    }

    if (annotations.length > 0) {
      const timer = setTimeout(() => {
        viewerRef.current?.restoreHighlights(annotations)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [activeFileIndex, annotations, effectiveViewMode])

  // Auto-save annotations to server (debounced, scoped to active file)
  useEffect(() => {
    if (submitted || !activeFile) {return}

    const timer = setTimeout(async () => {
      try {
        await fetch('/api/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ annotations, fileIndex: activeFileIndex })
        })
      } catch (_err) {
        // Silent failure
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [annotations, submitted, activeFileIndex, activeFile])

  // Adding an annotation leaves the panel in whatever state the user chose —
  // reopening it here would pull focus away from what they are reading.
  const handleAddAnnotation = useCallback((ann) => {
    annDispatch({ type: 'ADD', annotation: ann })
  }, [annDispatch])

  const handleAddGlobalComment = useCallback(() => {
    const ann = {
      id: createAnnotationId(),
      blockId: '',
      startOffset: 0,
      endOffset: 0,
      type: 'COMMENT',
      targetType: 'global',
      text: '',
      originalText: '',
      createdAt: Date.now(),
      startMeta: null,
      endMeta: null
    }
    annDispatch({ type: 'ADD', annotation: ann })
    setSidebarCollapsed(false)
  }, [annDispatch])

  const handleEditGlobalComment = useCallback((id, text) => {
    annDispatch({ type: 'EDIT', id, annotationType: 'COMMENT', text })
  }, [annDispatch])

  const handleDeleteAnnotation = useCallback((id) => {
    annDispatch({ type: 'DELETE', id })
    setSelectedAnnotationId(prev => prev === id ? null : prev)
  }, [annDispatch])

  const handleEditAnnotation = useCallback((id, annotationType, text, label) => {
    annDispatch({ type: 'EDIT', id, annotationType, text, label })
  }, [annDispatch])

  const handlePanelEdit = useCallback((id) => {
    const ann = annotations.find(a => a.id === id)
    if (!ann) {return}
    // Global comments and insertions have no highlight DOM — editing is handled inline in the panel
    if (ann.targetType === 'global' || ann.type === 'INSERTION') {
      setSelectedAnnotationId(id)
      setSidebarCollapsed(false)
      return
    }
    // Switch to the matching view mode before opening the toolbar
    const needsSource = ann.targetType === 'source'
    const targetMode = needsSource ? 'source' : 'preview'
    if (effectiveViewMode !== targetMode) {
      setViewMode(targetMode)
      setTimeout(() => {
        viewerRef.current?.openEditToolbar(ann)
      }, 200)
    } else {
      viewerRef.current?.openEditToolbar(ann)
    }
    setSelectedAnnotationId(id)
    setSidebarCollapsed(false)
  }, [annotations, effectiveViewMode])

  const handleImportAnnotations = useCallback((jsonData) => {
    const result = validateAnnotationImport(jsonData)
    if (!result.valid) {
      alert(`Import failed: ${result.error}`)
      return
    }
    if (result.annotations.length === 0) {
      alert('No annotations found in file')
      return
    }
    if (result.contentHash && activeFile?.contentHash &&
        result.contentHash !== activeFile.contentHash) {
      const proceed = window.confirm(
        'File content has changed since these annotations were exported. ' +
        'Annotations may not align correctly.\n\nImport anyway?'
      )
      if (!proceed) {return}
    }
    if (result.filePath && filePath && result.filePath !== filePath) {
      const proceed = window.confirm(
        `These annotations were exported from "${result.filePath}" ` +
        `but current file is "${filePath}".\n\nImport anyway?`
      )
      if (!proceed) {return}
    }
    if (annotations.length > 0) {
      const proceed = window.confirm(
        `This will replace ${annotations.length} existing annotation(s) ` +
        `with ${result.annotations.length} imported annotation(s). ` +
        `Undo history will be lost.\n\nContinue?`
      )
      if (!proceed) {return}
    }
    viewerRef.current?.clearAllHighlights()
    annDispatch({ type: 'RESTORE', annotations: result.annotations })
    setTimeout(() => {
      viewerRef.current?.restoreHighlights(result.annotations)
    }, 100)
    showToast(`Imported ${result.annotations.length} annotation${result.annotations.length !== 1 ? 's' : ''}`)
  }, [activeFile, filePath, annotations, annDispatch, showToast])

  const handleRestoreDraft = useCallback(() => {
    const restored = restoreDraft()
    if (restored.length > 0) {
      viewerRef.current?.clearAllHighlights()
      annDispatch({ type: 'RESTORE', annotations: restored })
      setTimeout(() => {
        viewerRef.current?.restoreHighlights(restored)
      }, 100)
      showToast(`Restored ${restored.length} annotation${restored.length !== 1 ? 's' : ''}`)
    }
  }, [restoreDraft, annDispatch, showToast])

  const handleUndo = useCallback(() => {
    annDispatch({ type: 'UNDO' })
  }, [annDispatch])

  const handleRedo = useCallback(() => {
    annDispatch({ type: 'REDO' })
  }, [annDispatch])

  const handleSelectAnnotation = useCallback((id) => {
    setSelectedAnnotationId(id)
  }, [])

  const handleSelectFile = useCallback((index) => {
    if (index === activeFileIndex) {return}
    setActiveFileIndex(index)
    filesDispatch({ type: 'MARK_REVIEWED', fileIndex: index })
  }, [activeFileIndex, filesDispatch])

  const handleOpenFile = useCallback(async (relativePath) => {
    const currentFiles = filesRef.current
    const pathOnly = relativePath.split(/[?#]/)[0]

    // Resolve relative path against current file's directory for deduplication
    const dir = filePath.replace(/[^/]*$/, '')
    const segments = (dir + pathOnly.replace(/^\.\//, '')).split('/')
    const resolved = []
    for (const seg of segments) {
      if (seg === '..') { resolved.pop() }
      else if (seg && seg !== '.') { resolved.push(seg) }
    }
    const resolvedPath = resolved.join('/')

    const existingIndex = currentFiles.findIndex(f =>
      f.path.replace(/^\.\//, '') === resolvedPath
    )
    if (existingIndex !== -1) {
      setActiveFileIndex(existingIndex)
      return
    }

    try {
      const params = new URLSearchParams({ path: pathOnly, relativeTo: filePath })
      const res = await fetch(`/api/file/open?${params}`)
      const json = await res.json()
      if (json.success) {
        // A directory link resolves to its index document, so dedupe on the real path
        const openIndex = filesRef.current.findIndex(f => f.path === json.data.path)
        if (openIndex !== -1) {
          setActiveFileIndex(openIndex)
          return
        }
        const newFile = {
          index: json.data.index,
          path: json.data.path,
          content: json.data.content,
          blocks: parseMarkdownToBlocks(json.data.content, { allowFrontmatter: !json.data.isPlainText }),
          contentHash: json.data.contentHash,
          hashMismatch: false,
          isPlainText: json.data.isPlainText || false
        }
        filesDispatch({ type: 'ADD_FILE', file: newFile })
        setActiveFileIndex(filesRef.current.length)
      } else {
        setErrorStatus(`Could not open file: ${json.error}`)
      }
    } catch (err) {
      setErrorStatus(`Error opening file: ${err.message}`)
    }
  }, [filePath, setErrorStatus])

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'textarea' || tag === 'input') {return}

      const isMod = e.metaKey || e.ctrlKey

      if (isMod && e.key === 'f') {
        e.preventDefault()
        if (crossFileSearchProps) {
          crossFileSearchState.openSearch()
        } else {
          viewerRef.current?.openSearch()
        }
        return
      }
      if (isMod && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        handleUndo()
      }
      if (isMod && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        handleRedo()
      }
      if (e.ctrlKey && !e.metaKey && e.key === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo, crossFileSearchProps, crossFileSearchState])

  const collectAnnotatedFiles = () => files.map(f => ({
    path: f.path,
    annotations: f.annState.annotations.filter(a => a.type !== 'NOTES'),
    blocks: f.blocks
  }))

  // Approving with annotations present keeps them as notes instead of discarding them
  const handleApprove = async () => {
    try {
      const response = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(totalAnnotationCount > 0 ? { files: collectAnnotatedFiles() } : {})
      })
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`)
      }
      setSubmitted(true)
      setDecision('approved')
      setApprovedNoteCount(totalAnnotationCount)
    } catch (err) {
      setErrorStatus('Approve failed: ' + err.message)
    }
  }

  const handleSubmitFeedback = async () => {
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: collectAnnotatedFiles() })
      })
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`)
      }
      setSubmitted(true)
      setDecision('feedback')
    } catch (err) {
      setErrorStatus('Submit failed: ' + err.message)
    }
  }

  const { serverGone, reconnectState } = useServerConnection({ submitted })

  const { state: autoCloseState, enableAndStart } = useAutoClose(submitted, settings.autoCloseDelay)
  const { width: panelWidth, handleMouseDown: handlePanelResize } = useResizablePanel('md-annotator-panel-width', 280, 1)
  const { width: tocWidth, handleMouseDown: handleTocResize } = useResizablePanel('md-annotator-toc-width', 220, -1)

  if (serverGone && !submitted) {
    return (
      <div className="app">
        <div className="done-screen">
          <div className="done-card">
            <div className="done-icon done-icon--disconnected">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/>
                <path d="M5 12.55a10.94 10.94 0 015.17-2.39"/>
                <path d="M10.71 5.05A16 16 0 0122.56 9"/>
                <path d="M1.42 9a15.91 15.91 0 014.7-2.88"/>
                <path d="M8.53 16.11a6 6 0 016.95 0"/>
                <line x1="12" y1="20" x2="12.01" y2="20"/>
              </svg>
            </div>
            <h1 className="done-title">Server Disconnected</h1>
            <p className="done-message">
              The server is no longer available. Your annotations have not been submitted.
            </p>
            {reconnectState === 'reconnecting' && (
              <p className="done-hint">Attempting to reconnect...</p>
            )}
            {reconnectState === 'failed' && (
              <p className="done-hint">Could not reconnect to the server.</p>
            )}
            {annotations.length > 0 && (
              <div className="done-actions">
                <p className="done-backup-info">
                  {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} in this file not yet submitted.
                </p>
                <button onClick={() => setExportModalOpen(true)} className="btn btn-feedback">
                  Export Annotations
                </button>
              </div>
            )}
          </div>
        </div>
        <ExportModal
          isOpen={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          annotations={annotations}
          blocks={blocks}
          filePath={filePath}
          contentHash={activeFile?.contentHash}
          onToast={showToast}
        />
        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="app">
        <div className="done-screen">
          <div className="done-card">
            <div className={`done-icon done-icon--${decision}`}>
              {decision === 'approved' ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </div>
            <h1 className="done-title">
              {decision === 'approved'
                ? (approvedNoteCount > 0 ? 'Approved with Notes' : 'Approved')
                : 'Feedback Submitted'}
            </h1>
            <p className="done-message">
              {decision === 'approved'
                ? (approvedNoteCount > 0
                  ? `Approved as-is. ${approvedNoteCount} annotation${approvedNoteCount !== 1 ? 's' : ''} passed along as notes.`
                  : 'No changes requested. The file was approved as-is.')
                : `${totalAnnotationCount} annotation${totalAnnotationCount !== 1 ? 's' : ''} ${ORIGIN_LABELS[origin] ? `sent to ${ORIGIN_LABELS[origin]}` : 'submitted'}.`}
            </p>
            {decision === 'feedback' && ORIGIN_LABELS[origin]
              ? <p className="done-hint">{ORIGIN_LABELS[origin]} is processing your feedback. A new browser tab will open with the next iteration.</p>
              : <p className="done-hint">You can close this tab.</p>}
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

  const handleReloadFile = async () => {
    try {
      const res = await fetch('/api/files')
      const json = await res.json()
      if (json.success) {
        const updated = json.data.files.find(f => f.path === activeFile?.path)
        if (updated) {
          filesDispatch({
            type: 'UPDATE_FILE',
            fileIndex: activeFileIndex,
            updates: {
              content: updated.content,
              blocks: parseMarkdownToBlocks(updated.content, { allowFrontmatter: !updated.isPlainText }),
              contentHash: updated.contentHash,
              hashMismatch: false,
              annState: { ...initialAnnotationState }
            }
          })
          viewerRef.current?.clearAllHighlights()
        }
      }
    } catch (err) {
      setErrorStatus('Error reloading: ' + err.message)
    }
  }

  const hasAnyHashMismatch = files.some(f => f.hashMismatch)

  return (
    <div className="app">
      {hasAnyHashMismatch && (
        <div className="hash-mismatch-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>File has changed since annotations were saved. Annotations may be outdated.</span>
          <button onClick={handleReloadFile} className="btn btn-sm">Reload</button>
        </div>
      )}
      {draftBanner && (
        <div className="draft-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span>Found {draftBanner.count} unsaved annotation{draftBanner.count !== 1 ? 's' : ''} from {draftBanner.timeAgo}.</span>
          <button onClick={handleRestoreDraft} className="btn btn-sm">Restore</button>
          <button onClick={dismissDraft} className="btn btn-sm btn-muted">Dismiss</button>
        </div>
      )}
      <header className="app-header">
        <div className="header-left">
          {!isPlainTextFile && (
            <button
              onClick={toggleToc}
              className="btn btn-icon"
              title={tocCollapsed ? 'Show table of contents' : 'Hide table of contents'}
              aria-label={tocCollapsed ? 'Show table of contents' : 'Hide table of contents'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </button>
          )}
          <Logo className="app-logo" />
          <span className="version-badge">v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'}</span>
          {ORIGIN_LABELS[origin] && (
            <span className="origin-badge">{ORIGIN_LABELS[origin]}</span>
          )}
          <span className="app-filepath">{filePath}</span>
        </div>
        <div className="header-right">
          <div className={`mode-toggle${shiftHeld ? ' mode-toggle--temp' : ''}`}>
            <button
              className={`mode-toggle-btn${!effectivePinpointMode ? ' active' : ''}`}
              onClick={() => setPinpointMode(shiftHeld)}
              title="Selection mode: select text to annotate (hold Shift to toggle)"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M3 10h8M3 15h10" />
              </svg>
              Select
            </button>
            <button
              className={`mode-toggle-btn${effectivePinpointMode ? ' active' : ''}`}
              onClick={() => setPinpointMode(!shiftHeld)}
              title="Pinpoint mode: click a block to annotate (hold Shift to toggle)"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="3" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
              </svg>
              Pinpoint
            </button>
          </div>
          <button
            onClick={handleSubmitFeedback}
            className="btn btn-feedback"
            disabled={totalAnnotationCount === 0}
            title={totalAnnotationCount === 0 ? 'Add annotations first' : `Submit ${totalAnnotationCount} annotation(s)`}
          >
            Feedback
            {totalAnnotationCount > 0 && <span className="btn-badge">{totalAnnotationCount}</span>}
          </button>
          <button
            onClick={handleApprove}
            className="btn btn-approve"
            title={totalAnnotationCount > 0
              ? `Approve as-is and pass ${totalAnnotationCount} annotation(s) along as notes`
              : 'Approve file as-is'}
          >
            {totalAnnotationCount > 0 ? 'Approve with Notes' : 'Approve'}
          </button>
          <button
            onClick={() => setSettingsModalOpen(true)}
            className="btn btn-icon"
            title="Settings"
            aria-label="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button
            onClick={toggleSidebar}
            className="btn btn-icon"
            title={sidebarCollapsed ? 'Show annotations' : 'Hide annotations'}
            aria-label={sidebarCollapsed ? 'Show annotations' : 'Hide annotations'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
          </button>
        </div>
      </header>

      <FileTabsBar
        files={files}
        activeFileIndex={activeFileIndex}
        onSelectFile={handleSelectFile}
      />

      <main className="app-main">
        {!isPlainTextFile && (
          <>
            <TableOfContents
              blocks={blocks}
              annotations={annotations}
              collapsed={tocCollapsed}
              width={tocWidth}
            />
            {!tocCollapsed && (
              <div
                className="resize-handle"
                onMouseDown={handleTocResize}
              />
            )}
          </>
        )}
        <div className="viewer-wrapper">
          {!isPlainTextFile && <div className="view-toggle">
            <button
              className={`view-toggle-btn${viewMode === 'preview' ? ' active' : ''}`}
              onClick={() => setViewMode('preview')}
              title="Rendered preview"
              aria-label="Rendered preview"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <button
              className={`view-toggle-btn${viewMode === 'source' ? ' active' : ''}`}
              onClick={() => setViewMode('source')}
              title="Markdown source"
              aria-label="Markdown source"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <polyline strokeLinecap="round" strokeLinejoin="round" points="16 18 22 12 16 6" />
                <polyline strokeLinecap="round" strokeLinejoin="round" points="8 6 2 12 8 18" />
              </svg>
            </button>
          </div>}
          {effectiveViewMode === 'preview' ? (
            <Viewer
              key={activeFile?.path || 'empty'}
              ref={viewerRef}
              blocks={blocks}
              annotations={annotations}
              onAddAnnotation={handleAddAnnotation}
              onEditAnnotation={handleEditAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
              onSelectAnnotation={handleSelectAnnotation}
              onOpenFile={handleOpenFile}
              pinpointMode={effectivePinpointMode}
              plantumlServerUrl={serverConfig.plantumlServerUrl}
              krokiServerUrl={serverConfig.krokiServerUrl}
              selectedAnnotationId={selectedAnnotationId}
              crossFileSearch={crossFileSearchProps}
            />
          ) : (
            <SourceView
              key={`source-${activeFile?.path || 'empty'}`}
              ref={viewerRef}
              content={activeFile?.content || ''}
              annotations={annotations}
              onAddAnnotation={handleAddAnnotation}
              onEditAnnotation={handleEditAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
              onSelectAnnotation={handleSelectAnnotation}
            />
          )}
        </div>
        {!sidebarCollapsed && (
          <div
            className="resize-handle"
            onMouseDown={handlePanelResize}
          />
        )}
        <AnnotationPanel
          annotations={annotations}
          selectedAnnotationId={selectedAnnotationId}
          onSelect={handleSelectAnnotation}
          onEdit={handlePanelEdit}
          onDelete={handleDeleteAnnotation}
          onExport={() => setExportModalOpen(true)}
          onImport={handleImportAnnotations}
          onAddGlobalComment={handleAddGlobalComment}
          onEditGlobalComment={handleEditGlobalComment}
          collapsed={sidebarCollapsed}
          width={panelWidth}
        />
      </main>

      <footer className="app-status">
        <span>{status}</span>
        {activeFile?.content && (
          <FileStats content={activeFile.content} />
        )}
      </footer>

      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        annotations={annotations}
        blocks={blocks}
        filePath={filePath}
        contentHash={activeFile?.contentHash}
        onToast={showToast}
      />

      <FeedbackNotesModal
        isOpen={notesModalOpen}
        onClose={() => setNotesModalOpen(false)}
        notesGroups={notesGroups}
        totalFiles={files.length}
      />

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={settings}
        updateSetting={updateSetting}
        resetSettings={resetSettings}
      />

      <UpdateBanner />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
