import { useRef, useState, useEffect, useCallback } from 'react'
import Highlighter from 'web-highlighter'
import { INTENTS, intentOf } from '../../../shared/utils/intents.js'

const INTENT_CLASSES = INTENTS.map(({ id }) => `intent-${id}`)

/**
 * The note's stable number sits on the first mark that is its own (overlaps
 * nest marks of other notes inside it), where CSS draws it as a badge.
 */
function showNoteNumber(doms, ann) {
  doms.forEach((dom) => { if (dom.dataset.highlightId === ann.id) { delete dom.dataset.noteNumber } })
  const first = doms.find((dom) => dom.dataset.highlightId === ann.id)
  if (first && Number.isInteger(ann.number)) { first.dataset.noteNumber = String(ann.number) }
}

/**
 * Shared web-highlighter integration for annotation views.
 *
 * Handles: highlighter lifecycle, CREATE/CLICK events, toolbar state,
 * keyboard shortcuts, annotation class sync, imperative highlight methods,
 * and text annotation creation.
 *
 * Extension points (all optional):
 * - onBeforeHighlight(currentToolbarState) — cleanup before new highlight/click
 * - enrichToolbarState(element) — extra fields for toolbar state on CREATE/CLICK
 * - extraAnnotationFields — static fields merged into new annotations
 * - restoreFilter(ann) — only restore annotations matching this predicate
 * - restoreInsertion(ann) — place the marker of an INSERTION note, returns whether it was placed
 *
 * Keyboard shortcuts are NOT included — each consumer registers its own.
 */
export function useHighlighter({
  annotations,
  onAddAnnotation,
  onEditAnnotation,
  onDeleteAnnotation,
  onSelectAnnotation,
  exceptSelectors = [],
  onBeforeHighlight,
  enrichToolbarState,
  extraAnnotationFields,
  restoreFilter,
  restoreInsertion,
}) {
  const containerRef = useRef(null)
  const highlighterRef = useRef(null)
  const pendingSourceRef = useRef(null)
  const isRestoringRef = useRef(false)
  const [toolbarState, setToolbarState] = useState(null)
  const [requestedToolbarStep, setRequestedToolbarStep] = useState(null)

  // Single ref object for all values accessed in closures
  const r = useRef({})
  r.current = {
    onAddAnnotation, onEditAnnotation, annotations, toolbarState,
    onBeforeHighlight, enrichToolbarState, extraAnnotationFields,
    restoreFilter, restoreInsertion,
  }

  // --- Highlighter setup ---
  useEffect(() => {
    if (!containerRef.current) { return }

    const highlighter = new Highlighter({
      $root: containerRef.current,
      exceptSelectors: ['.annotation-toolbar', 'button', ...exceptSelectors],
      wrapTag: 'mark',
      style: { className: 'annotation-highlight' }
    })
    highlighterRef.current = highlighter

    highlighter.on(Highlighter.event.CREATE, ({ sources }) => {
      if (isRestoringRef.current) { return }
      if (sources.length > 0) {
        const source = sources[0]
        const doms = highlighter.getDoms(source.id)
        if (doms?.length > 0) {
          r.current.onBeforeHighlight?.(r.current.toolbarState)
          if (pendingSourceRef.current) {
            highlighter.remove(pendingSourceRef.current.id)
            pendingSourceRef.current = null
          }
          pendingSourceRef.current = source
          const extra = r.current.enrichToolbarState?.(doms[0]) || {}
          setToolbarState({ element: doms[0], source, ...extra })
        }
      }
    })

    highlighter.on(Highlighter.event.CLICK, ({ id }) => {
      const current = r.current.toolbarState
      r.current.onBeforeHighlight?.(current)

      const clickedDom = highlighter.getDoms(id)?.[0]
      const overlappingIds = new Set()
      let node = clickedDom
      while (node && !node.dataset?.blockId) {
        if (node.dataset?.highlightId) { overlappingIds.add(node.dataset.highlightId) }
        node = node.parentElement
      }
      const overlapping = r.current.annotations.filter(a => overlappingIds.has(a.id))

      let targetAnn
      if (overlapping.length > 1 && current?.mode === 'edit' && overlapping.some(a => a.id === current.annotation?.id)) {
        const currentIdx = overlapping.findIndex(a => a.id === current.annotation.id)
        targetAnn = overlapping[(currentIdx + 1) % overlapping.length]
      } else {
        targetAnn = r.current.annotations.find(a => a.id === id)
      }

      if (!targetAnn) { return }

      if (current?.mode === 'edit' && current?.annotation?.id === targetAnn.id) {
        setToolbarState(null)
        setRequestedToolbarStep(null)
        return
      }
      if (pendingSourceRef.current) {
        highlighter.remove(pendingSourceRef.current.id)
        pendingSourceRef.current = null
      }
      onSelectAnnotation(targetAnn.id)
      if (targetAnn.type === 'NOTES') { return }
      const targetDoms = highlighter.getDoms(targetAnn.id)
      if (targetDoms?.length > 0) {
        const extra = r.current.enrichToolbarState?.(targetDoms[0]) || {}
        setToolbarState({ element: targetDoms[0], annotation: targetAnn, mode: 'edit', ...extra })
        setRequestedToolbarStep(null)
      }
    })

    highlighter.run()

    return () => { highlighter.dispose() }
  }, [onSelectAnnotation]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Sync annotation highlight classes ---
  useEffect(() => {
    const highlighter = highlighterRef.current
    if (!highlighter) { return }
    annotations.forEach(ann => {
      try {
        const doms = highlighter.getDoms(ann.id)
        if (doms?.length > 0) {
          if (ann.type === 'DELETION') { highlighter.addClass('deletion', ann.id) }
          else if (ann.type === 'COMMENT') { highlighter.addClass('comment', ann.id) }
          // The underline and tint follow the intent; an edit can change it.
          const intent = intentOf(ann)
          INTENT_CLASSES.forEach((name) => highlighter.removeClass(name, ann.id))
          if (intent) { highlighter.addClass(`intent-${intent}`, ann.id) }
          showNoteNumber(doms, ann)
        }
      } catch (_e) { /* ignore */ }
    })
  }, [annotations])

  // --- Create annotation from text selection ---
  const createAnnotationFromSource = useCallback((type, text, label, intent) => {
    const highlighter = highlighterRef.current
    const source = r.current.toolbarState?.source
    if (!highlighter || !source) { return }

    const doms = highlighter.getDoms(source.id)
    let blockId = ''
    let startOffset = 0

    if (doms?.length > 0) {
      const el = doms[0]
      let parent = el.parentElement
      while (parent && !parent.dataset.blockId) { parent = parent.parentElement }
      if (parent?.dataset.blockId) {
        blockId = parent.dataset.blockId
        const range = document.createRange()
        range.selectNodeContents(parent)
        range.setEnd(el, 0)
        startOffset = range.toString().length
      }
    }

    const newAnnotation = {
      id: source.id,
      blockId,
      startOffset,
      endOffset: startOffset + source.text.length,
      type,
      text: text || null,
      originalText: source.text,
      createdAt: Date.now(),
      startMeta: source.startMeta,
      endMeta: source.endMeta,
      label: label || null,
      ...(intent ? { intent } : {}),
      ...r.current.extraAnnotationFields,
    }

    if (type === 'DELETION') { highlighter.addClass('deletion', source.id) }
    else if (type === 'COMMENT') { highlighter.addClass('comment', source.id) }

    r.current.onAddAnnotation(newAnnotation)
  }, [])

  // --- Handle text annotation (edit or new) ---
  const handleTextAnnotate = useCallback((type, text, label, intent) => {
    if (!toolbarState) { return }
    const highlighter = highlighterRef.current
    if (!highlighter) { return }

    if (toolbarState.mode === 'edit') {
      const { annotation } = toolbarState
      highlighter.removeClass('deletion', annotation.id)
      highlighter.removeClass('comment', annotation.id)
      highlighter.addClass(type.toLowerCase(), annotation.id)
      r.current.onEditAnnotation(annotation.id, type, text, label, intent)
    } else {
      createAnnotationFromSource(type, text, label, intent)
      pendingSourceRef.current = null
    }

    setToolbarState(null)
    setRequestedToolbarStep(null)
    window.getSelection()?.removeAllRanges()
  }, [toolbarState, createAnnotationFromSource])

  // --- Close toolbar ---
  const handleToolbarClose = useCallback(() => {
    if (toolbarState?.mode !== 'edit' && toolbarState?.source && highlighterRef.current) {
      highlighterRef.current.remove(toolbarState.source.id)
    }
    pendingSourceRef.current = null
    setToolbarState(null)
    setRequestedToolbarStep(null)
    window.getSelection()?.removeAllRanges()
  }, [toolbarState])

  // --- Delete annotation ---
  const handleToolbarDelete = useCallback((id) => {
    onDeleteAnnotation(id)
    setToolbarState(null)
    setRequestedToolbarStep(null)
  }, [onDeleteAnnotation])

  // --- Imperative highlight methods ---
  const unwrapOrRemove = (el) => {
    if (el.classList?.contains('insertion-marker') || el.classList?.contains('insertion-marker-temp')) {
      el.remove()
      return
    }
    const parent = el.parentNode
    while (el.firstChild) { parent?.insertBefore(el.firstChild, el) }
    el.remove()
  }

  const removeHighlight = (id) => {
    highlighterRef.current?.remove(id)
    containerRef.current?.querySelectorAll(`[data-highlight-id="${id}"]`).forEach(unwrapOrRemove)
  }

  // A delayed restore is handed the notes as loaded. The reducer has numbered them since, and its copy is the one the cards show.
  const currentNote = (ann) => r.current.annotations.find((a) => a.id === ann.id) ?? ann

  const restoreHighlight = (loaded) => {
    const ann = currentNote(loaded)
    if (ann.type === 'INSERTION' && r.current.restoreInsertion) { return r.current.restoreInsertion(ann) }
    if (ann.targetType === 'image' || ann.targetType === 'diagram' ||
        ann.targetType === 'pinpoint' || ann.targetType === 'global' ||
        ann.targetType === 'link' || ann.type === 'NOTES' || ann.type === 'INSERTION') { return true }
    if (r.current.restoreFilter && !r.current.restoreFilter(ann)) { return false }
    const highlighter = highlighterRef.current
    if (!highlighter) { return false }
    const wasRestoring = isRestoringRef.current
    isRestoringRef.current = true
    try {
      highlighter.fromStore(ann.startMeta, ann.endMeta, ann.originalText, ann.id)
      highlighter.addClass(ann.type.toLowerCase(), ann.id)
      const intent = intentOf(ann)
      if (intent) { highlighter.addClass(`intent-${intent}`, ann.id) }
      showNoteNumber(highlighter.getDoms(ann.id) ?? [], ann)
      return true
    } catch (_e) {
      return false
    } finally {
      isRestoringRef.current = wasRestoring
    }
  }

  const restoreHighlights = (anns) => {
    anns.forEach((ann) => { restoreHighlight(ann) })
  }

  const clearAllHighlights = () => {
    highlighterRef.current?.removeAll()
    containerRef.current?.querySelectorAll('.annotation-highlight, [data-highlight-id]').forEach(unwrapOrRemove)
  }

  const updateHighlightType = (id, type) => {
    const highlighter = highlighterRef.current
    if (!highlighter) { return }
    highlighter.removeClass('deletion', id)
    highlighter.removeClass('comment', id)
    highlighter.addClass(type.toLowerCase(), id)
  }

  return {
    containerRef,
    highlighterRef,
    pendingSourceRef,
    isRestoringRef,
    toolbarState,
    setToolbarState,
    requestedToolbarStep,
    setRequestedToolbarStep,
    handleTextAnnotate,
    handleToolbarClose,
    handleToolbarDelete,
    highlightMethods: { removeHighlight, restoreHighlight, restoreHighlights, clearAllHighlights, updateHighlightType },
  }
}
