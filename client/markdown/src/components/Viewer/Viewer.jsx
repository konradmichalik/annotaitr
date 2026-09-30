import { useRef, useState, useEffect, useMemo, forwardRef, useImperativeHandle, useCallback } from 'react'
import 'highlight.js/styles/github-dark.css'
import { Toolbar } from '../Toolbar.jsx'
import { MermaidBlock } from '../MermaidBlock.jsx'
import { PlantUMLBlock } from '../PlantUMLBlock.jsx'
import { KrokiBlock, KROKI_LANGUAGES } from '../KrokiBlock.jsx'
import { PinpointOverlay } from '../PinpointOverlay.jsx'
import { BlockHoverHint } from '../BlockHoverHint.jsx'
import { BlockRenderer, HtmlWrapper } from './BlockRenderer.jsx'
import { MathBlock } from './MathBlock.jsx'
import { CodeBlock } from './CodeBlock.jsx'
import { useHighlighter } from '../../hooks/useHighlighter.js'
import { createAnnotationId } from '../../../../shared/utils/annotationId.js'
import { useDocumentSearch } from '../../hooks/useDocumentSearch.js'
import { highlightMatches, setActiveMatch, clearSearchHighlights } from '../../utils/searchHighlight.js'
import { SearchBar } from '../SearchBar.jsx'
import { getQuickLabels, formatLabelText } from '../../utils/quickLabels.js'
import { getItem, setItem } from '../../../../shared/utils/storage.js'
import { groupHtmlWrappers } from '../../utils/htmlWrappers.js'
import { isOpenableFileLink } from '../../utils/links.js'

const PINPOINT_HINT_LEARNED_KEY = 'md-annotator-pinpoint-hint-learned'
const HINT_SKIP_SELECTOR = 'a[href], button, .code-copy-btn, .diagram-controls, .annotation-highlight, .annotation-toolbar, .comment-popover'

function getLinkInfo(el) {
  const linkEl = el.closest('a[data-href]') || el.querySelector('a[data-href]')
  const linkUrl = linkEl?.dataset?.href || null
  return { linkUrl, linkIsOpenable: isOpenableFileLink(linkUrl) }
}

function removeInsertionMarker(el) {
  const parent = el?.parentNode
  if (parent) {
    parent.removeChild(el)
    parent.normalize()
  }
}

function createPersistentInsertionMarker(id, blockEl, offset) {
  const marker = document.createElement('span')
  marker.className = 'insertion-marker'
  marker.dataset.highlightId = id
  marker.dataset.insertionId = id
  marker.textContent = '\u200B'

  const range = document.createRange()
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT)
  let charCount = 0
  let placed = false

  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.parentElement?.closest('.insertion-marker')) { continue }
    const len = node.textContent.length
    if (charCount + len >= offset) {
      range.setStart(node, offset - charCount)
      range.collapse(true)
      range.insertNode(marker)
      placed = true
      break
    }
    charCount += len
  }

  if (!placed) {
    blockEl.appendChild(marker)
  }

  return marker
}

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
  })

  const search = useDocumentSearch(containerRef)

  // Sync DOM highlighting with cross-file search query on the current page
  const crossFileMarksRef = useRef([])
  useEffect(() => {
    const container = containerRef.current
    if (!crossFileSearch) { return }

    // Clear previous cross-file highlights
    clearSearchHighlights(container)
    crossFileMarksRef.current = []

    const query = crossFileSearch.query
    if (!query || !container) { return }

    const timer = setTimeout(() => {
      const marks = highlightMatches(container, query)
      crossFileMarksRef.current = marks
      if (marks.length > 0) {
        setActiveMatch(marks, 0)
      }
    }, 200)

    return () => {
      clearTimeout(timer)
      clearSearchHighlights(container)
      crossFileMarksRef.current = []
    }
  }, [crossFileSearch?.query, containerRef, crossFileSearch])

  // Keep a ref to annotations for non-hook callbacks
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const onAddAnnotationRef = useRef(onAddAnnotation)
  onAddAnnotationRef.current = onAddAnnotation
  const onEditAnnotationRef = useRef(onEditAnnotation)
  onEditAnnotationRef.current = onEditAnnotation

  // --- Viewer-specific annotate (insertion + element + text) ---
  const handleAnnotate = useCallback((type, text, label) => {
    if (!toolbarState) { return }

    // Insertion annotations bypass web-highlighter
    if (toolbarState.insertionMode) {
      const insertionText = typeof text === 'string' ? text.trim() : ''
      removeInsertionMarker(toolbarState.element)
      if (!insertionText) {
        setToolbarState(null)
        setRequestedToolbarStep(null)
        window.getSelection()?.removeAllRanges()
        return
      }
      const { blockId, offset, afterContext } = toolbarState.insertionData
      const annId = createAnnotationId()
      const newAnnotation = {
        id: annId,
        blockId,
        startOffset: offset,
        endOffset: offset,
        type: 'INSERTION',
        text: insertionText,
        afterContext,
        originalText: '',
        createdAt: Date.now(),
        startMeta: null,
        endMeta: null
      }
      const blockEl = containerRef.current?.querySelector(`[data-block-id="${blockId}"]`)
      if (blockEl) {
        createPersistentInsertionMarker(annId, blockEl, offset)
      }
      onAddAnnotationRef.current(newAnnotation)
      setToolbarState(null)
      setRequestedToolbarStep(null)
      window.getSelection()?.removeAllRanges()
      return
    }

    // Token annotations in code blocks
    if (toolbarState.tokenMode && !toolbarState.mode) {
      const { tokenData } = toolbarState
      const newAnnotation = {
        id: createAnnotationId(),
        blockId: tokenData.blockId,
        startOffset: tokenData.charStart,
        endOffset: tokenData.charEnd,
        type,
        targetType: 'token',
        text: text || null,
        originalText: tokenData.tokenText,
        createdAt: Date.now(),
        startMeta: null,
        endMeta: null,
        label: label || null
      }
      onAddAnnotationRef.current(newAnnotation)
      setToolbarState(null)
      setRequestedToolbarStep(null)
      return
    }

    // Element annotations (image/diagram) bypass web-highlighter
    if (toolbarState.elementMode) {
      if (toolbarState.mode === 'edit') {
        onEditAnnotationRef.current(toolbarState.annotation.id, type, text)
      } else {
        const { elementData } = toolbarState
        const newAnnotation = {
          id: createAnnotationId(),
          blockId: elementData.blockId,
          startOffset: 0,
          endOffset: 0,
          type,
          targetType: elementData.targetType,
          text: text || null,
          originalText: elementData.originalText,
          createdAt: Date.now(),
          startMeta: null,
          endMeta: null,
          imageAlt: elementData.imageAlt,
          imageSrc: elementData.imageSrc,
          label: label || null
        }
        onAddAnnotationRef.current(newAnnotation)
      }
      setToolbarState(null)
      setRequestedToolbarStep(null)
      return
    }

    // Text annotation — delegate to hook
    handleTextAnnotate(type, text, label)
  }, [toolbarState, handleTextAnnotate, setToolbarState, setRequestedToolbarStep, containerRef])

  // --- Viewer-specific close (insertion cleanup + base) ---
  const handleToolbarClose = useCallback(() => {
    if (toolbarState?.insertionMode) {
      removeInsertionMarker(toolbarState.element)
    }
    baseToolbarClose()
  }, [toolbarState, baseToolbarClose])

  // --- Quick label handler ---
  const handleQuickLabel = useCallback((label) => {
    if (!toolbarState) { return }
    handleAnnotate('COMMENT', formatLabelText(label), label)
  }, [toolbarState, handleAnnotate])

  // --- Keyboard shortcuts (Viewer-specific: delegates to handleAnnotate/handleToolbarClose) ---
  const kbAnnotateRef = useRef(null)
  const kbCloseRef = useRef(null)
  const kbQuickLabelRef = useRef(null)
  kbAnnotateRef.current = handleAnnotate
  kbCloseRef.current = handleToolbarClose
  kbQuickLabelRef.current = handleQuickLabel
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'textarea' || tag === 'input') { return }
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.key === 'd' && toolbarState) {
        e.preventDefault()
        kbAnnotateRef.current('DELETION')
      }
      if (isMod && e.key === 'k' && toolbarState) {
        e.preventDefault()
        setRequestedToolbarStep(prev => (prev ?? 0) + 1)
      }
      if (e.key === 'Escape' && toolbarState) {
        e.preventDefault()
        kbCloseRef.current()
      }
      // Search shortcuts (work even without search input focus)
      const activeSearch = crossFileSearch || search
      if (activeSearch.isOpen) {
        if (e.key === 'F3') {
          e.preventDefault()
          activeSearch.stepMatch(e.shiftKey ? -1 : +1)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          activeSearch.closeSearch()
          return
        }
      }
      // Alt+1-0 quick label shortcuts
      if (e.altKey && !isMod && toolbarState && toolbarState.mode !== 'edit') {
        const isDigit = e.code >= 'Digit1' && e.code <= 'Digit9' || e.code === 'Digit0'
        if (isDigit) {
          e.preventDefault()
          const labels = getQuickLabels()
          const index = e.code === 'Digit0' ? 9 : parseInt(e.code.replace('Digit', ''), 10) - 1
          if (index < labels.length) {
            kbQuickLabelRef.current(labels[index])
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toolbarState, setRequestedToolbarStep, search.isOpen, search.stepMatch, search.closeSearch, crossFileSearch])

  // --- Imperative handle ---
  useImperativeHandle(ref, () => ({
    ...highlightMethods,
    openSearch: crossFileSearch ? crossFileSearch.openSearch : search.openSearch,
    closeSearch: crossFileSearch ? crossFileSearch.closeSearch : search.closeSearch,
    restoreHighlight(ann) {
      if (ann.type === 'INSERTION') {
        const blockEl = containerRef.current?.querySelector(`[data-block-id="${ann.blockId}"]`)
        if (!blockEl) { return false }
        const existing = blockEl.querySelector(`[data-insertion-id="${ann.id}"]`)
        if (!existing) {
          createPersistentInsertionMarker(ann.id, blockEl, ann.startOffset)
        }
        return true
      }
      return highlightMethods.restoreHighlight(ann)
    },
    restoreHighlights(anns) {
      anns.forEach(ann => { this.restoreHighlight(ann) })
    },
    openEditToolbar(ann) {
      if (ann.targetType === 'image' || ann.targetType === 'diagram' || ann.targetType === 'math' || ann.targetType === 'pinpoint' || ann.targetType === 'link' || ann.targetType === 'token') {
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
      let targetEl = null
      if (ann.targetType === 'image') {
        targetEl = containerRef.current?.querySelector(
          `[data-block-id="${ann.blockId}"] .annotatable-image-wrapper[data-image-src="${CSS.escape(ann.imageSrc)}"]`
        )
      } else if (ann.targetType === 'diagram') {
        targetEl = containerRef.current?.querySelector(
          `[data-block-id="${ann.blockId}"] .diagram-render-area`
        ) || containerRef.current?.querySelector(`[data-block-id="${ann.blockId}"]`)
      } else if (ann.targetType === 'math') {
        targetEl = containerRef.current?.querySelector(
          `[data-block-id="${ann.blockId}"] .annotatable-math`
        )
      } else if (ann.targetType === 'pinpoint') {
        targetEl = containerRef.current?.querySelector(`[data-block-id="${ann.blockId}"]`)
      } else if (ann.targetType === 'link') {
        const blockEl = containerRef.current?.querySelector(`[data-block-id="${ann.blockId}"]`)
        if (blockEl) {
          const anchors = blockEl.querySelectorAll('a[href]')
          targetEl = Array.from(anchors).find(a => a.textContent === ann.originalText) || anchors[0]
        }
      } else if (ann.targetType === 'token') {
        const blockEl = containerRef.current?.querySelector(`[data-block-id="${ann.blockId}"]`)
        if (blockEl) {
          const codeEl = blockEl.querySelector('code.hljs')
          if (codeEl) {
            const spans = codeEl.querySelectorAll('span')
            const range = document.createRange()
            for (const span of spans) {
              if (span.textContent !== ann.originalText) { continue }
              range.selectNodeContents(codeEl)
              range.setEnd(span, 0)
              if (range.toString().length === ann.startOffset) {
                targetEl = span
                break
              }
            }
          }
        }
      }
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          setToolbarState({ element: targetEl, annotation: ann, mode: 'edit', elementMode: true })
        }, 300)
      }
    }
  }))

  // --- Insertion mode: Alt+Click ---
  useEffect(() => {
    const container = containerRef.current
    if (!container) { return }

    const handleCursorClick = (e) => {
      if (!e.altKey) { return }
      if (toolbarState) { return }
      if (pendingSourceRef.current) { return }
      if (isRestoringRef.current) { return }
      if (e.defaultPrevented) { return }
      if (e.target.closest('.annotation-toolbar, button, a[href], .code-copy-btn, .annotatable-image-wrapper, .diagram-render-area, .diagram-source, .diagram-controls, .block-note-border, .insertion-marker')) { return }

      requestAnimationFrame(() => {
        if (pendingSourceRef.current || toolbarState) { return }
        const sel = window.getSelection()
        if (!sel || !sel.isCollapsed || sel.rangeCount === 0) { return }
        const range = sel.getRangeAt(0)

        let blockEl = range.startContainer
        if (blockEl.nodeType === Node.TEXT_NODE) { blockEl = blockEl.parentElement }
        while (blockEl && !blockEl.dataset?.blockId) { blockEl = blockEl.parentElement }
        if (!blockEl || !container.contains(blockEl)) { return }
        if (range.startContainer.parentElement?.closest('[data-highlight-id]')) { return }

        const blockId = blockEl.dataset.blockId
        const blockText = blockEl.textContent || ''
        const preRange = document.createRange()
        preRange.selectNodeContents(blockEl)
        preRange.setEnd(range.startContainer, range.startOffset)
        const offset = preRange.toString().length
        const afterContext = blockText.slice(Math.max(0, offset - 50), offset)

        const marker = document.createElement('span')
        marker.className = 'insertion-marker-temp'
        marker.textContent = '\u200B'
        range.insertNode(marker)

        setToolbarState({
          element: marker,
          insertionMode: true,
          insertionData: { blockId, offset, afterContext }
        })
      })
    }

    const handleInsertionMarkerClick = (e) => {
      const marker = e.target.closest('.insertion-marker[data-insertion-id]')
      if (!marker) { return }
      e.stopPropagation()
      const annId = marker.dataset.insertionId
      const ann = annotationsRef.current.find(a => a.id === annId)
      if (!ann) { return }
      onSelectAnnotation(annId)
      setToolbarState({ element: marker, annotation: ann, mode: 'edit', insertionEdit: true })
      setRequestedToolbarStep(null)
    }

    container.addEventListener('click', handleCursorClick)
    container.addEventListener('click', handleInsertionMarkerClick)

    return () => {
      container.querySelectorAll('.insertion-marker-temp').forEach(removeInsertionMarker)
      container.removeEventListener('click', handleCursorClick)
      container.removeEventListener('click', handleInsertionMarkerClick)
    }
  }, [onSelectAnnotation, toolbarState, setToolbarState, setRequestedToolbarStep, containerRef, pendingSourceRef, isRestoringRef])

  // --- Computed sets for annotated elements ---
  const annotatedImages = useMemo(() => {
    const map = new Map()
    annotations.filter(a => a.targetType === 'image').forEach(a => { map.set(`${a.blockId}::${a.imageSrc}`, a.type) })
    return map
  }, [annotations])

  const annotatedDiagramBlocks = useMemo(() => {
    const map = new Map()
    annotations.filter(a => a.targetType === 'diagram').forEach(a => { map.set(a.blockId, a.type) })
    return map
  }, [annotations])

  const annotatedMathBlocks = useMemo(() => {
    const map = new Map()
    annotations.filter(a => a.targetType === 'math').forEach(a => { map.set(a.blockId, a.type) })
    return map
  }, [annotations])

  const annotatedPinpointBlocks = useMemo(() => {
    const map = new Map()
    annotations.filter(a => a.targetType === 'pinpoint').forEach(a => { map.set(a.blockId, a.type) })
    return map
  }, [annotations])

  useEffect(() => {
    if (!containerRef.current) { return }
    const blockEls = containerRef.current.querySelectorAll('[data-block-id]')
    blockEls.forEach(el => {
      const blockId = el.dataset.blockId
      const type = annotatedPinpointBlocks.get(blockId)
      el.classList.toggle('pinpoint-annotated', !!type)
      el.classList.toggle('pinpoint-deletion', type === 'DELETION')
      el.classList.toggle('pinpoint-comment', type === 'COMMENT')
    })
  }, [annotatedPinpointBlocks, containerRef])

  const noteBlockIds = useMemo(() => {
    const map = new Map()
    annotations.filter(a => a.type === 'NOTES' && a.blockId).forEach(a => {
      if (!map.has(a.blockId)) { map.set(a.blockId, a.id) }
    })
    return map
  }, [annotations])

  const handleNoteClick = useCallback((blockId) => {
    const annId = noteBlockIds.get(blockId)
    if (annId) { onSelectAnnotation(annId) }
  }, [noteBlockIds, onSelectAnnotation])

  const handleImageClick = useCallback(({ alt, src, blockId, element }) => {
    if (pendingSourceRef.current && highlighterRef.current) {
      highlighterRef.current.remove(pendingSourceRef.current.id)
      pendingSourceRef.current = null
    }
    const existing = annotationsRef.current.find(
      a => a.targetType === 'image' && a.blockId === blockId && a.imageSrc === src
    )
    if (existing) {
      onSelectAnnotation(existing.id)
      setToolbarState({ element, annotation: existing, mode: 'edit', elementMode: true })
      setRequestedToolbarStep(null)
    } else {
      setToolbarState({
        element,
        elementMode: true,
        elementData: { targetType: 'image', blockId, imageAlt: alt, imageSrc: src, originalText: `![${alt}](${src})` }
      })
      setRequestedToolbarStep(null)
    }
  }, [onSelectAnnotation, pendingSourceRef, highlighterRef, setToolbarState, setRequestedToolbarStep])

  const makeElementHandler = useCallback((targetType) => ({ blockId, content, element }) => {
    if (pendingSourceRef.current && highlighterRef.current) {
      highlighterRef.current.remove(pendingSourceRef.current.id)
      pendingSourceRef.current = null
    }
    const existing = annotationsRef.current.find(
      a => a.targetType === targetType && a.blockId === blockId
    )
    if (existing) {
      onSelectAnnotation(existing.id)
      setToolbarState({ element, annotation: existing, mode: 'edit', elementMode: true })
      setRequestedToolbarStep(null)
    } else {
      setToolbarState({
        element,
        elementMode: true,
        elementData: { targetType, blockId, originalText: content }
      })
      setRequestedToolbarStep(null)
    }
  }, [onSelectAnnotation, pendingSourceRef, highlighterRef, setToolbarState, setRequestedToolbarStep])

  const handleDiagramClick = makeElementHandler('diagram')
  const handleMathClick = makeElementHandler('math')
  const handleTableAnnotate = makeElementHandler('table')

  const handleLinkClick = useCallback((e) => {
    const anchor = e.target.closest('a[href]')
    if (anchor) {
      const href = anchor.getAttribute('href')
      if (href?.startsWith('#')) { return }
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        e.preventDefault()
        const { linkUrl, linkIsOpenable } = getLinkInfo(anchor)
        if (pendingSourceRef.current && highlighterRef.current) {
          highlighterRef.current.remove(pendingSourceRef.current.id)
          pendingSourceRef.current = null
        }
        const blockEl = anchor.closest('[data-block-id]')
        const blockId = blockEl?.dataset?.blockId
        const linkText = anchor.textContent || ''
        setToolbarState({
          element: anchor,
          linkUrl,
          linkIsOpenable,
          elementMode: true,
          elementData: { targetType: 'link', blockId, originalText: linkText }
        })
        setRequestedToolbarStep(null)
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
        if (pendingSourceRef.current && highlighterRef.current) {
          highlighterRef.current.remove(pendingSourceRef.current.id)
          pendingSourceRef.current = null
        }
        onSelectAnnotation(existing.id)
        setToolbarState({ element: pinpointEl, annotation: existing, mode: 'edit', elementMode: true })
        setRequestedToolbarStep(null)
      }
    }
  }, [onSelectAnnotation, pendingSourceRef, highlighterRef, containerRef, setToolbarState, setRequestedToolbarStep])

  const getBlockLabel = useCallback((blockEl) => {
    const blockId = blockEl.dataset.blockId
    const block = blocks.find(b => b.id === blockId)
    if (!block) { return 'Block' }
    if (block.type === 'heading') { return `Heading ${block.level}` }
    if (block.type === 'code') { return `Code${block.language ? ` (${block.language})` : ''}` }
    if (block.type === 'list-item') { return 'List item' }
    if (block.type === 'blockquote') { return 'Blockquote' }
    if (block.type === 'frontmatter') { return 'Frontmatter' }
    if (block.type === 'hr') { return 'Divider' }
    if (block.type === 'math') { return 'Formula' }
    return 'Paragraph'
  }, [blocks])

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

    if (pendingSourceRef.current && highlighterRef.current) {
      highlighterRef.current.remove(pendingSourceRef.current.id)
      pendingSourceRef.current = null
    }

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
    setPinpointTarget({ element: blockEl, label: getBlockLabel(blockEl) })
  }, [pinpointMode, onSelectAnnotation, onOpenFile, getBlockLabel, pendingSourceRef, highlighterRef, containerRef, setToolbarState, setRequestedToolbarStep])

  // --- Token-level selection in code blocks ---
  const handleTokenSelect = useCallback(({ blockId, element, tokenText, charStart, charEnd }) => {
    // If clicking the same already-selected token, deselect (toggle)
    if (toolbarState?.tokenMode && toolbarState?.tokenData?.blockId === blockId &&
        toolbarState?.tokenData?.charStart === charStart) {
      setToolbarState(null)
      setRequestedToolbarStep(null)
      return
    }

    if (pendingSourceRef.current && highlighterRef.current) {
      highlighterRef.current.remove(pendingSourceRef.current.id)
      pendingSourceRef.current = null
    }

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
  }, [toolbarState, onSelectAnnotation, pendingSourceRef, highlighterRef, setToolbarState, setRequestedToolbarStep])

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

  const renderBlock = (block) =>
    block.type === 'math' ? (
      <MathBlock
        key={block.id}
        block={block}
        onMathClick={handleMathClick}
        annotationType={annotatedMathBlocks.get(block.id) || null}
        hasNote={noteBlockIds.has(block.id)}
        onNoteClick={handleNoteClick}
      />
    ) : block.type === 'code' && block.language === 'mermaid' ? (
      <MermaidBlock
        key={block.id}
        block={block}
        onDiagramClick={handleDiagramClick}
        annotationType={annotatedDiagramBlocks.get(block.id) || null}
        hasNote={noteBlockIds.has(block.id)}
        onNoteClick={handleNoteClick}
      />
    ) : block.type === 'code' && block.language === 'plantuml' ? (
      <PlantUMLBlock
        key={block.id}
        block={block}
        serverUrl={plantumlServerUrl}
        onDiagramClick={handleDiagramClick}
        annotationType={annotatedDiagramBlocks.get(block.id) || null}
        hasNote={noteBlockIds.has(block.id)}
        onNoteClick={handleNoteClick}
      />
    ) : block.type === 'code' && KROKI_LANGUAGES.has(block.language) ? (
      <KrokiBlock
        key={block.id}
        block={block}
        serverUrl={krokiServerUrl}
        onDiagramClick={handleDiagramClick}
        annotationType={annotatedDiagramBlocks.get(block.id) || null}
        hasNote={noteBlockIds.has(block.id)}
        onNoteClick={handleNoteClick}
      />
    ) : block.type === 'code' ? (
      <CodeBlock
        key={block.id}
        block={block}
        hasNote={noteBlockIds.has(block.id)}
        onNoteClick={handleNoteClick}
        onTokenSelect={handleTokenSelect}
      />
    ) : (
      <BlockRenderer
        key={block.id}
        block={block}
        onImageClick={handleImageClick}
        onTableAnnotate={handleTableAnnotate}
        annotatedImages={annotatedImages}
        hasNote={noteBlockIds.has(block.id)}
        onNoteClick={handleNoteClick}
      />
    )

  const renderNodes = (nodes) => nodes.map(node =>
    node.kind === 'wrapper' ? (
      <HtmlWrapper key={node.block.id} block={node.block}>
        {renderNodes(node.children)}
      </HtmlWrapper>
    ) : (
      renderBlock(node.block)
    )
  )

  return (
    <div className="viewer-container">
      <article
        ref={containerRef}
        className={`viewer-article${pinpointMode ? ' pinpoint-mode' : ''}`}
        onClick={pinpointMode ? handlePinpointClick : handleLinkClick}
        onMouseMove={handleBlockHover}
        onMouseLeave={handleBlockHoverLeave}
      >
        {renderNodes(blockNodes)}
        <Toolbar
          highlightElement={toolbarState?.element ?? null}
          onAnnotate={handleAnnotate}
          onClose={handleToolbarClose}
          onDelete={handleToolbarDelete}
          onQuickLabel={handleQuickLabel}
          requestedStep={requestedToolbarStep}
          editAnnotation={toolbarState?.mode === 'edit' ? toolbarState.annotation : null}
          elementMode={toolbarState?.elementMode || false}
          insertionMode={toolbarState?.insertionMode || false}
          linkUrl={toolbarState?.linkUrl || null}
          onOpenLink={toolbarState?.linkIsOpenable ? onOpenFile : null}
        />
        {pinpointMode && <PinpointOverlay target={pinpointTarget} />}
        {!pinpointMode && <BlockHoverHint target={hoverHintTarget} />}
      </article>
      {(crossFileSearch ? crossFileSearch.isOpen : search.isOpen) && (
        <SearchBar
          query={crossFileSearch ? crossFileSearch.query : search.query}
          setQuery={crossFileSearch ? crossFileSearch.setQuery : search.setQuery}
          matchCount={crossFileSearch ? crossFileSearch.totalMatchCount : search.matchCount}
          activeIndex={crossFileSearch ? crossFileSearch.activeResultIndex : search.activeIndex}
          stepMatch={crossFileSearch ? crossFileSearch.stepMatch : search.stepMatch}
          closeSearch={crossFileSearch ? crossFileSearch.closeSearch : search.closeSearch}
          crossFileResults={crossFileSearch?.results}
          activeResultIndex={crossFileSearch?.activeResultIndex}
          onSelectResult={crossFileSearch?.onSelectResult}
        />
      )}
    </div>
  )
})
