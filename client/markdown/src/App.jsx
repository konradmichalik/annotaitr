import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Viewer } from './components/Viewer/Viewer.jsx'
import { SourceView } from './components/Viewer/SourceView.jsx'
import { AnnotationPanel } from './components/AnnotationPanel.jsx'
import { TableOfContents } from './components/TableOfContents.jsx'
import { ExportModal } from './components/ExportModal.jsx'
import { FeedbackNotesModal } from './components/FeedbackNotesModal.jsx'
import { AppHeader } from '../../shared/components/AppHeader.jsx'
import { DecisionDialog } from '../../shared/components/DecisionDialog.jsx'
import { SidePanelIcon } from '../../shared/components/HeaderIcons.jsx'
import { useDecisionShortcut } from '../../shared/hooks/useDecisionShortcut.js'
import { useReviewDecision, isGeneralComment, createGeneralComment } from './hooks/useReviewDecision.js'
import { DisconnectedScreen, SubmittedScreen } from './components/DoneScreens.jsx'
import { HashMismatchBanner, DraftBanner } from './components/ReviewBanners.jsx'
import { CanvasTopbar } from './components/CanvasTopbar.jsx'
import { validateAnnotationImport } from './utils/export.js'
import { getTextStats } from './utils/textStats.js'
import { UpdateBanner } from '../../shared/components/UpdateBanner.jsx'
import { FileTabsBar } from './components/FileTabsBar.jsx'
import { initialAnnotationState } from './state/annotationReducer.js'
import { useAutoClose } from '../../shared/hooks/useAutoClose.js'
import { useResizablePanel } from '../../shared/hooks/useResizablePanel.js'
import { useServerConnection } from '../../shared/hooks/useServerConnection.js'
import { useAnnotationDraft } from './hooks/useAnnotationDraft.js'
import { useSettings } from './hooks/useSettings.js'
import { useCrossFileSearch } from './hooks/useCrossFileSearch.js'
import { useHighlightSync } from './hooks/useHighlightSync.js'
import { useReviewFiles } from './hooks/useReviewFiles.js'
import { useReviewShortcuts } from './hooks/useReviewShortcuts.js'
import { useShiftHeld } from './hooks/useShiftHeld.js'
import { useModeShortcuts } from './hooks/useModeShortcuts.js'
import { SettingsModal } from './components/SettingsModal.jsx'
import { getItem, setItem } from '../../shared/utils/storage.js'
import 'katex/dist/katex.min.css'
import './styles.css'

const NOTE_NOUNS = {
  COMMENT: ['comment'],
  DELETION: ['deletion'],
  INSERTION: ['insertion'],
}

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

export default function App() {
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null)
  const [status, setStatus] = useState('Loading...')
  const { settings, updateSetting, resetSettings } = useSettings()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed)
  const [tocCollapsed, setTocCollapsed] = useState(getInitialTocCollapsed)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [notesModalOpen, setNotesModalOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState(null)
  const [decisionOpen, setDecisionOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [pinpointMode, setPinpointMode] = useState(() => settings.defaultMode === 'pinpoint')
  const [viewMode, setViewMode] = useState('preview') // 'preview' | 'source'
  const shiftHeld = useShiftHeld()
  const viewerRef = useRef(null)
  const toastTimerRef = useRef(null)
  const notesShownRef = useRef(false)
  const errorTimerRef = useRef(null)

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

  const {
    files,
    filesDispatch,
    activeFileIndex,
    setActiveFileIndex,
    origin,
    serverConfig,
    openFile,
    reloadActiveFile,
  } = useReviewFiles({ viewerRef, setStatus, setErrorStatus })

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
  // The active file's general comment is what the decision dialog's summary edits.
  const generalComment = annotations.find(isGeneralComment) ?? null
  const decisionNoteTypes = files.flatMap(f => f.annState.annotations)
    .filter(a => a.type !== 'NOTES' && a !== generalComment)
    .map(a => a.type)
  const notesGroups = files
    .map(f => ({
      filePath: f.path,
      notes: f.annState.annotations.filter(a => a.type === 'NOTES')
    }))
    .filter(g => g.notes.length > 0)

  // Cross-file search (only active for multi-file sessions)
  const crossFileSearchState = useCrossFileSearch(files)
  const isMultiFile = files.length > 1

  const handleCrossFileSelectResult = useCallback((fileIndex) => {
    if (fileIndex !== activeFileIndex) {
      setActiveFileIndex(fileIndex)
    }
  }, [activeFileIndex, setActiveFileIndex])

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
  }, [activeFileIndex, filesDispatch])

  const { decision, submitted, approvedNoteCount, finish } = useReviewDecision({
    files, activeFileIndex, annDispatch, setErrorStatus,
  })

  // Draft auto-save and restore
  const { draftBanner, restoreDraft, dismissDraft } = useAnnotationDraft({
    annotations,
    contentHash: activeFile?.contentHash,
    submitted,
    enabled: settings.autoSaveDrafts,
  })

  const clearSelection = useCallback(() => setSelectedAnnotationId(null), [])

  useHighlightSync({
    viewerRef,
    annState: activeAnnState,
    activeFileIndex,
    viewMode: effectiveViewMode,
    onFileChange: clearSelection,
  })

  useEffect(() => {
    setItem('md-annotator-sidebar-collapsed', sidebarCollapsed)
  }, [sidebarCollapsed])

  useEffect(() => {
    setItem('md-annotator-toc-collapsed', tocCollapsed)
  }, [tocCollapsed])

  const effectivePinpointMode = shiftHeld ? !pinpointMode : pinpointMode

  const toggleToc = useCallback(() => {
    setTocCollapsed(prev => !prev)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev)
  }, [])

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
    annDispatch({ type: 'ADD', annotation: createGeneralComment('') })
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
  }, [activeFileIndex, setActiveFileIndex, filesDispatch])

  const handleOpenSearch = useCallback(() => {
    if (crossFileSearchProps) {
      crossFileSearchState.openSearch()
    } else {
      viewerRef.current?.openSearch()
    }
  }, [crossFileSearchProps, crossFileSearchState])

  useReviewShortcuts({ onSearch: handleOpenSearch, onUndo: handleUndo, onRedo: handleRedo })
  const pickMode = useCallback((mode) => setPinpointMode(mode === 'pinpoint'), [])
  useModeShortcuts({ disabled: submitted || settingsTab !== null || decisionOpen || exportModalOpen, onChange: pickMode })

  const openDecision = useCallback(() => setDecisionOpen(true), [])
  const closeDecision = useCallback(() => setDecisionOpen(false), [])
  useDecisionShortcut(openDecision, !submitted && settingsTab === null)

  const finishFromDialog = (result) => {
    setDecisionOpen(false)
    finish(result)
  }

  const { serverGone, reconnectState } = useServerConnection({ submitted })

  const { state: autoCloseState, enableAndStart } = useAutoClose(submitted, settings.autoCloseDelay)
  const { width: panelWidth, handleMouseDown: handlePanelResize } = useResizablePanel('md-annotator-panel-width', 300, 1)
  const { width: tocWidth, handleMouseDown: handleTocResize } = useResizablePanel('md-annotator-toc-width', 220, -1)

  const exportModal = (
    <ExportModal
      isOpen={exportModalOpen}
      onClose={() => setExportModalOpen(false)}
      annotations={annotations}
      blocks={blocks}
      filePath={filePath}
      contentHash={activeFile?.contentHash}
      onToast={showToast}
    />
  )

  if (serverGone && !submitted) {
    return (
      <div className="app-shell">
        <DisconnectedScreen
          reconnectState={reconnectState}
          annotationCount={annotations.length}
          onExport={() => setExportModalOpen(true)}
        />
        {exportModal}
        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="app-shell">
        <SubmittedScreen
          decision={decision}
          approvedNoteCount={approvedNoteCount}
          totalAnnotationCount={totalAnnotationCount}
          origin={origin}
          autoCloseState={autoCloseState}
          onEnableAutoClose={() => {
            updateSetting('autoCloseDelay', '3')
            enableAndStart()
          }}
        />
      </div>
    )
  }

  const hasAnyHashMismatch = files.some(f => f.hashMismatch)

  return (
    <div className="app-shell">
      {hasAnyHashMismatch && <HashMismatchBanner onReload={reloadActiveFile} />}
      {draftBanner && (
        <DraftBanner draft={draftBanner} onRestore={handleRestoreDraft} onDismiss={dismissDraft} />
      )}
      <AppHeader
        leading={!isPlainTextFile && (
          <button
            type="button"
            onClick={toggleToc}
            className="btn btn-icon header-icon-btn"
            title={tocCollapsed ? 'Show table of contents' : 'Hide table of contents'}
            aria-label={tocCollapsed ? 'Show table of contents' : 'Hide table of contents'}
          >
            <SidePanelIcon side="left" />
          </button>
        )}
        source={isPlainTextFile ? 'text' : 'markdown'}
        target={filePath}
        facts={isMultiFile ? `file ${activeFileIndex + 1} of ${files.length}` : null}
        origin={origin}
        onOpenShortcuts={() => setSettingsTab('shortcuts')}
        onOpenSettings={() => setSettingsTab('appearance')}
        panelCollapsed={sidebarCollapsed}
        onTogglePanel={toggleSidebar}
        decision={{
          itemCount: totalAnnotationCount,
          title: totalAnnotationCount > 0
            ? `Send ${totalAnnotationCount} annotation${totalAnnotationCount === 1 ? '' : 's'}`
            : 'Approve as-is',
          dialogOpen: decisionOpen,
          onPrimary: (choice) => finish({ choice }),
          onOpenDialog: openDecision,
        }}
      />

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
                className="panel-splitter"
                onMouseDown={handleTocResize}
              />
            )}
          </>
        )}
        <div className="viewer-wrapper canvas-surface">
          <CanvasTopbar
            shiftHeld={shiftHeld}
            pinpointMode={effectivePinpointMode}
            onPinpointModeChange={setPinpointMode}
            showViewToggle={!isPlainTextFile}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onUndo={handleUndo}
            canUndo={activeAnnState.history.length > 0}
          />
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
              onOpenFile={openFile}
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
            className="panel-splitter"
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

      {exportModal}

      <FeedbackNotesModal
        isOpen={notesModalOpen}
        onClose={() => setNotesModalOpen(false)}
        notesGroups={notesGroups}
        totalFiles={files.length}
      />

      {decisionOpen && (
        <DecisionDialog
          origin={origin}
          noteTypes={decisionNoteTypes}
          nouns={NOTE_NOUNS}
          generalType="COMMENT"
          generalText={generalComment ? generalComment.text : null}
          onSubmit={finishFromDialog}
          onClose={closeDecision}
        />
      )}

      <SettingsModal
        isOpen={settingsTab !== null}
        initialTab={settingsTab ?? undefined}
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
