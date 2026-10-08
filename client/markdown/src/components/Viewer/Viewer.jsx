import { useRef, useState, useEffect, useMemo, forwardRef, useImperativeHandle, useCallback } from 'react'
import 'highlight.js/styles/github-dark.css'
import { Toolbar } from '../Toolbar.jsx'
import { PinpointOverlay } from '../PinpointOverlay.jsx'
import { BlockHoverHint } from '../BlockHoverHint.jsx'
import { SearchBar } from '../SearchBar.jsx'
import { ViewerBlocks } from './ViewerBlocks.jsx'
import { useHighlighter } from '../../hooks/useHighlighter.js'
import { useDocumentSearch } from '../../hooks/useDocumentSearch.js'
import { useCrossFileSearchMarks } from '../../hooks/useCrossFileSearchMarks.js'
import { useViewerShortcuts } from '../../hooks/useViewerShortcuts.js'
import { useInsertionClick } from '../../hooks/useInsertionClick.js'
import { useAnnotatedBlocks } from '../../hooks/useAnnotatedBlocks.js'
import { formatLabelText } from '../../utils/quickLabels.js'
import { getItem, setItem } from '../../../../shared/utils/storage.js'
import { groupHtmlWrappers } from '../../utils/htmlWrappers.js'
import { isOpenableFileLink } from '../../utils/links.js'
import { getLinkInfo, removeInsertionMarker, createPersistentInsertionMarker, createTemporaryInsertionMarker, insertionPointAfter, findAnnotationElement } from '../../utils/viewerDom.js'
import { createInsertionAnnotation, createTokenAnnotation, createElementAnnotation, getBlockLabel } from '../../utils/viewerAnnotations.js'

const PINPOINT_HINT_LEARNED_KEY = 'md-annotator-pinpoint-hint-learned'
const HINT_SKIP_SELECTOR = 'a[href], button, .code-copy-btn, .diagram-controls, .annotation-highlight, .annotation-toolbar, .comment-popover'
const ELEMENT_TARGET_TYPES = new Set(['image', 'diagram', 'math', 'pinpoint', 'link', 'token'])

export const Viewer = forwardRef(function Viewer({
  blocks,
  annotations,
  onAddAnnotation,
  onEditAnnotation,
  onDeleteAnnotation,
  onSelectAnnotation,
  onOpenFile,
  pinpointMode,
  plantumlServerUrl,
  krokiServerUrl,
  selectedAnnotationId: _selectedAnnotationId,
  crossFileSearch,
  newIntent = 'change',
  toolHints = true,
}, ref) {
  const [pinpointTarget, setPinpointTarget] = useState(null)
  const [hoverHintTarget, setHoverHintTarget] = useState(null)
  const hintLearnedRef = useRef(getItem(PINPOINT_HINT_LEARNED_KEY) === '1')

  const onBeforeHighlight = useCallback((currentState) => {
    if (currentState?.insertionMode) {
      removeInsertionMarker(currentState.element)
    }
  }, [])

  const enrichToolbarState = useCallback((element) => getLinkInfo(element), [])

  const {
    containerRef,
    highlighterRef,
    pendingSourceRef,
    isRestoringRef,
    toolbarState,
    setToolbarState,
    requestedToolbarStep,
    setRequestedToolbarStep,
    handleTextAnnotate,
    handleToolbarClose: baseToolbarClose,
    handleToolbarDelete,
    highlightMethods,
  } = useHighlighter({
    annotations,
    onAddAnnotation,
    onEditAnnotation,
    onDeleteAnnotation,
    onSelectAnnotation,
    exceptSelectors: ['.code-copy-btn', '.annotatable-image-wrapper', '.diagram-render-area', '.diagram-source', '.diagram-controls'],
    onBeforeHighlight,
    enrichToolbarState,
    restoreInsertion: (ann) => {
      const blockEl = containerRef.current?.querySelector(`[data-block-id="${ann.blockId}"]`)
      if (!blockEl) { return false }
      if (!blockEl.querySelector(`[data-insertion-id="${ann.id}"]`)) {
        createPersistentInsertionMarker(ann.id, blockEl, ann.startOffset, ann.number)
      }
      return true
    },
  })

  const search = useDocumentSearch(containerRef)
  useCrossFileSearchMarks(containerRef, crossFileSearch)

  // Keep a ref to annotations for non-hook callbacks
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const onAddAnnotationRef = useRef(onAddAnnotation)
  onAddAnnotationRef.current = onAddAnnotation
  const onEditAnnotationRef = useRef(onEditAnnotation)
  onEditAnnotationRef.current = onEditAnnotation

  // A new insertion gets its number from the reducer, after its marker exists.
  useEffect(() => {
    const container = containerRef.current
    if (!container) { return }
    annotations.forEach((ann) => {
      if (ann.type !== 'INSERTION' || !Number.isInteger(ann.number)) { return }
      const marker = container.querySelector(`[data-insertion-id="${CSS.escape(ann.id)}"]`)
      if (marker) { marker.dataset.noteNumber = String(ann.number) }
    })
  }, [annotations, containerRef])

  // A pending text selection is dropped as soon as the user targets an element instead
  const clearPendingSource = useCallback(() => {
    if (pendingSourceRef.current && highlighterRef.current) {
      highlighterRef.current.remove(pendingSourceRef.current.id)
      pendingSourceRef.current = null
    }
  }, [pendingSourceRef, highlighterRef])

  const closeToolbar = useCallback(() => {
    setToolbarState(null)
    setRequestedToolbarStep(null)
  }, [setToolbarState, setRequestedToolbarStep])

  // --- Viewer-specific annotate (insertion + element + text) ---
  const handleAnnotate = useCallback((type, text, label, intent) => {
    if (!toolbarState) { return }

    // Insertion annotations bypass web-highlighter
    if (toolbarState.insertionMode) {
      const insertionText = typeof text === 'string' ? text.trim() : ''
      removeInsertionMarker(toolbarState.element)
      if (insertionText) {
        const newAnnotation = createInsertionAnnotation(toolbarState.insertionData, insertionText)
        const blockEl = containerRef.current?.querySelector(`[data-block-id="${newAnnotation.blockId}"]`)
        if (blockEl) {
          createPersistentInsertionMarker(newAnnotation.id, blockEl, newAnnotation.startOffset)
        }
        onAddAnnotationRef.current(newAnnotation)
      }
      closeToolbar()
      window.getSelection()?.removeAllRanges()
      return
    }

    // Token annotations in code blocks
    if (toolbarState.tokenMode && !toolbarState.mode) {
      onAddAnnotationRef.current({ ...createTokenAnnotation(toolbarState.tokenData, type, text, label), ...(intent ? { intent } : {}) })
      closeToolbar()
      return
    }

    // Element annotations (image/diagram) bypass web-highlighter
    if (toolbarState.elementMode) {
      if (toolbarState.mode === 'edit') {
        onEditAnnotationRef.current(toolbarState.annotation.id, type, text, undefined, intent)
      } else {
        onAddAnnotationRef.current({ ...createElementAnnotation(toolbarState.elementData, type, text, label), ...(intent ? { intent } : {}) })
      }
      closeToolbar()
      return
    }

    // Text annotation — delegate to hook
    handleTextAnnotate(type, text, label, intent)
  }, [toolbarState, handleTextAnnotate, closeToolbar, containerRef])

  // Add on a text selection inserts after it: the pending highlight gives way to an insertion point at its end.
  const handleAddAfter = useCallback(() => {
    const highlighter = highlighterRef.current
    const source = toolbarState?.source
    const last = source && highlighter?.getDoms(source.id)?.at(-1)
    if (!last) { return }
    const point = insertionPointAfter(last)
    if (!point) { return }
    highlighter.remove(source.id)
    pendingSourceRef.current = null
    window.getSelection()?.removeAllRanges()
    const { blockEl, ...insertionData } = point
    const marker = createTemporaryInsertionMarker(blockEl, insertionData.offset)
    setToolbarState({ element: marker, insertionMode: true, insertionData })
    setRequestedToolbarStep((prev) => (prev ?? 0) + 1)
  }, [toolbarState, highlighterRef, pendingSourceRef, setToolbarState, setRequestedToolbarStep])

  // --- Viewer-specific close (insertion cleanup + base) ---
  const handleToolbarClose = useCallback(() => {
    if (toolbarState?.insertionMode) {
      removeInsertionMarker(toolbarState.element)
    }
    baseToolbarClose()
  }, [toolbarState, baseToolbarClose])

  const handleQuickLabel = useCallback((label) => {
    if (!toolbarState) { return }
    handleAnnotate('COMMENT', formatLabelText(label), label)
  }, [toolbarState, handleAnnotate])

  useViewerShortcuts({
    toolbarState,
    setRequestedToolbarStep,
    search,
    crossFileSearch,
    onAnnotate: handleAnnotate,
    onClose: handleToolbarClose,
    onQuickLabel: handleQuickLabel,
  })

  useImperativeHandle(ref, () => ({
    ...highlightMethods,
    openSearch: crossFileSearch ? crossFileSearch.openSearch : search.openSearch,
    closeSearch: crossFileSearch ? crossFileSearch.closeSearch : search.closeSearch,
    openEditToolbar(ann) {
      if (ELEMENT_TARGET_TYPES.has(ann.targetType)) {
        this.openElementEditToolbar(ann)
        return
      }
      const highlighter = highlighterRef.current
      if (!highlighter) { return }
      if (pendingSourceRef.current) {
        highlighter.remove(pendingSourceRef.current.id)
        pendingSourceRef.current = null
      }
      const doms = highlighter.getDoms(ann.id)
      if (doms?.length > 0) {
        doms[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          setToolbarState({ element: doms[0], annotation: ann, mode: 'edit' })
        }, 300)
      }
    },
    openElementEditToolbar(ann) {
      const targetEl = findAnnotationElement(containerRef.current, ann)
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          setToolbarState({ element: targetEl, annotation: ann, mode: 'edit', elementMode: true })
        }, 300)
      }
    }
  }))

  useInsertionClick({
    containerRef,
    toolbarState,
    setToolbarState,
    setRequestedToolbarStep,
    pendingSourceRef,
    isRestoringRef,
    annotationsRef,
    onSelectAnnotation,
  })

  const annotated = useAnnotatedBlocks(annotations, containerRef)
  const { noteBlockIds } = annotated

  const handleNoteClick = useCallback((blockId) => {
    const annId = noteBlockIds.get(blockId)
    if (annId) { onSelectAnnotation(annId) }
  }, [noteBlockIds, onSelectAnnotation])

  // Open the toolbar on an element: edit its existing annotation, or start a new one
  const openElementToolbar = useCallback((element, existing, newState) => {
    clearPendingSource()
    if (existing) {
      onSelectAnnotation(existing.id)
      setToolbarState({ element, annotation: existing, mode: 'edit', elementMode: true })
    } else {
      setToolbarState({ element, elementMode: true, ...newState })
    }
    setRequestedToolbarStep(null)
  }, [clearPendingSource, onSelectAnnotation, setToolbarState, setRequestedToolbarStep])

  const handleImageClick = useCallback(({ alt, src, blockId, element }) => {
    const existing = annotationsRef.current.find(
      a => a.targetType === 'image' && a.blockId === blockId && a.imageSrc === src
    )
    openElementToolbar(element, existing, {
      elementData: { targetType: 'image', blockId, imageAlt: alt, imageSrc: src, originalText: `![${alt}](${src})` }
    })
  }, [openElementToolbar])

  const makeElementHandler = useCallback((targetType) => ({ blockId, content, element }) => {
    const existing = annotationsRef.current.find(
      a => a.targetType === targetType && a.blockId === blockId
    )
    openElementToolbar(element, existing, { elementData: { targetType, blockId, originalText: content } })
  }, [openElementToolbar])

  const handleLinkClick = useCallback((e) => {
    const anchor = e.target.closest('a[href]')
    if (anchor) {
      const href = anchor.getAttribute('href')
      if (href?.startsWith('#')) { return }
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        e.preventDefault()
        const blockId = anchor.closest('[data-block-id]')?.dataset?.blockId
        openElementToolbar(anchor, null, {
          ...getLinkInfo(anchor),
          elementData: { targetType: 'link', blockId, originalText: anchor.textContent || '' }
        })
        return
      }
    }

    const pinpointEl = e.target.closest('.pinpoint-annotated[data-block-id]')
    if (pinpointEl && containerRef.current?.contains(pinpointEl)) {
      const blockId = pinpointEl.dataset.blockId
      const existing = annotationsRef.current.find(
        a => a.blockId === blockId && a.targetType === 'pinpoint'
      )
      if (existing) {
        e.preventDefault()
        openElementToolbar(pinpointEl, existing)
      }
    }
  }, [openElementToolbar, containerRef])

  const handlePinpointClick = useCallback((e) => {
    if (!pinpointMode) { return }

    const anchor = e.target.closest('a[href]')
    if (anchor) {
      const href = anchor.getAttribute('href')
      if (isOpenableFileLink(href)) {
        e.preventDefault()
        onOpenFile?.(href)
      }
      return
    }

    if (e.target.closest('.annotation-toolbar, .comment-popover, button, .code-copy-btn, .diagram-controls')) { return }

    e.preventDefault()
    e.stopPropagation()

    clearPendingSource()

    let blockEl = e.target
    while (blockEl && !blockEl.dataset?.blockId) { blockEl = blockEl.parentElement }
    if (!blockEl || !containerRef.current?.contains(blockEl)) { return }

    const blockId = blockEl.dataset.blockId
    const blockText = blockEl.textContent || ''

    const existing = annotationsRef.current.find(
      a => a.blockId === blockId && a.targetType === 'pinpoint'
    )

    if (existing) {
      onSelectAnnotation(existing.id)
      setToolbarState({ element: blockEl, annotation: existing, mode: 'edit', elementMode: true })
    } else {
      setToolbarState({
        element: blockEl,
        elementMode: true,
        elementData: {
          targetType: 'pinpoint',
          blockId,
          originalText: blockText.length > 200 ? blockText.slice(0, 200) + '...' : blockText
        }
      })
      if (!hintLearnedRef.current) {
        hintLearnedRef.current = true
        setItem(PINPOINT_HINT_LEARNED_KEY, '1')
        setHoverHintTarget(null)
      }
    }
    setRequestedToolbarStep(null)
    setPinpointTarget({ element: blockEl, label: getBlockLabel(blocks.find(b => b.id === blockId)) })
  }, [pinpointMode, onSelectAnnotation, onOpenFile, blocks, clearPendingSource, containerRef, setToolbarState, setRequestedToolbarStep])

  // --- Token-level selection in code blocks ---
  const handleTokenSelect = useCallback(({ blockId, element, tokenText, charStart, charEnd }) => {
    // If clicking the same already-selected token, deselect (toggle)
    if (toolbarState?.tokenMode && toolbarState?.tokenData?.blockId === blockId &&
        toolbarState?.tokenData?.charStart === charStart) {
      closeToolbar()
      return
    }

    clearPendingSource()

    const existing = annotationsRef.current.find(
      a => a.targetType === 'token' && a.blockId === blockId && a.startOffset === charStart && a.endOffset === charEnd
    )

    if (existing) {
      onSelectAnnotation(existing.id)
      setToolbarState({ element, annotation: existing, mode: 'edit', elementMode: true, tokenMode: true })
    } else {
      setToolbarState({
        element,
        elementMode: true,
        tokenMode: true,
        tokenData: { blockId, tokenText, charStart, charEnd, targetType: 'token', originalText: tokenText }
      })
    }
    setRequestedToolbarStep(null)
  }, [toolbarState, onSelectAnnotation, clearPendingSource, closeToolbar, setToolbarState, setRequestedToolbarStep])

  useEffect(() => {
    if (!toolbarState) { setPinpointTarget(null) }
  }, [toolbarState])

  // --- Block hover hint (select mode discoverability) ---
  const handleBlockHover = useCallback((e) => {
    if (pinpointMode || hintLearnedRef.current) { return }
    if (toolbarState) { setHoverHintTarget(null); return }
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) { setHoverHintTarget(null); return }
    if (e.target.closest(HINT_SKIP_SELECTOR)) { setHoverHintTarget(null); return }

    let blockEl = e.target
    while (blockEl && !blockEl.dataset?.blockId) { blockEl = blockEl.parentElement }
    if (!blockEl || !containerRef.current?.contains(blockEl)) { setHoverHintTarget(null); return }

    setHoverHintTarget(prev => (prev?.element === blockEl ? prev : { element: blockEl }))
  }, [pinpointMode, toolbarState, containerRef])

  const handleBlockHoverLeave = useCallback(() => {
    setHoverHintTarget(null)
  }, [])

  const blockNodes = useMemo(() => groupHtmlWrappers(blocks), [blocks])

  const blockHandlers = {
    onMathClick: makeElementHandler('math'),
    onDiagramClick: makeElementHandler('diagram'),
    onTableAnnotate: makeElementHandler('table'),
    onImageClick: handleImageClick,
    onTokenSelect: handleTokenSelect,
    onNoteClick: handleNoteClick,
  }

  const activeSearch = crossFileSearch
    ? { ...crossFileSearch, matchCount: crossFileSearch.totalMatchCount, activeIndex: crossFileSearch.activeResultIndex }
    : search

  return (
    <div className="viewer-container">
      <article
        ref={containerRef}
        className={`viewer-article${pinpointMode ? ' pinpoint-mode' : ''}`}
        onClick={pinpointMode ? handlePinpointClick : handleLinkClick}
        onMouseMove={handleBlockHover}
        onMouseLeave={handleBlockHoverLeave}
      >
        <ViewerBlocks
          nodes={blockNodes}
          annotated={annotated}
          handlers={blockHandlers}
          plantumlServerUrl={plantumlServerUrl}
          krokiServerUrl={krokiServerUrl}
        />
        <Toolbar
          highlightElement={toolbarState?.element ?? null}
          onAnnotate={handleAnnotate}
          onAddAfter={toolbarState?.source && !toolbarState.mode ? handleAddAfter : null}
          onClose={handleToolbarClose}
          onDelete={handleToolbarDelete}
          onQuickLabel={handleQuickLabel}
          requestedStep={requestedToolbarStep}
          editAnnotation={toolbarState?.mode === 'edit' ? toolbarState.annotation : null}
          elementMode={toolbarState?.elementMode || false}
          insertionMode={toolbarState?.insertionMode || false}
          linkUrl={toolbarState?.linkUrl || null}
          onOpenLink={toolbarState?.linkIsOpenable ? onOpenFile : null}
          newIntent={newIntent}
        />
        {pinpointMode && <PinpointOverlay target={pinpointTarget} />}
        {!pinpointMode && toolHints && <BlockHoverHint target={hoverHintTarget} />}
      </article>
      {activeSearch.isOpen && (
        <SearchBar
          query={activeSearch.query}
          setQuery={activeSearch.setQuery}
          matchCount={activeSearch.matchCount}
          activeIndex={activeSearch.activeIndex}
          stepMatch={activeSearch.stepMatch}
          closeSearch={activeSearch.closeSearch}
          crossFileResults={crossFileSearch?.results}
          activeResultIndex={crossFileSearch?.activeResultIndex}
          onSelectResult={crossFileSearch?.onSelectResult}
        />
      )}
    </div>
  )
})
