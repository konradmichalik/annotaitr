import { useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { Toolbar } from '../Toolbar.jsx'
import { SearchBar } from '../SearchBar.jsx'
import { useHighlighter } from '../../hooks/useHighlighter.js'
import { useDocumentSearch } from '../../hooks/useDocumentSearch.js'

const RESTORE_FILTER = (ann) => ann.targetType === 'source'

export const SourceView = forwardRef(function SourceView({
  content,
  annotations,
  onAddAnnotation,
  onEditAnnotation,
  onDeleteAnnotation,
  onSelectAnnotation,
  selectedAnnotationId: _selectedAnnotationId
}, ref) {
  const lines = useMemo(() => content.split('\n'), [content])

  const {
    containerRef,
    highlighterRef,
    pendingSourceRef,
    toolbarState,
    setToolbarState,
    requestedToolbarStep,
    setRequestedToolbarStep,
    handleTextAnnotate,
    handleToolbarClose,
    handleToolbarDelete,
    highlightMethods,
  } = useHighlighter({
    annotations,
    onAddAnnotation,
    onEditAnnotation,
    onDeleteAnnotation,
    onSelectAnnotation,
    exceptSelectors: ['.source-line-number'],
    extraAnnotationFields: { targetType: 'source' },
    restoreFilter: RESTORE_FILTER,
  })

  const search = useDocumentSearch(containerRef)

  useImperativeHandle(ref, () => ({
    ...highlightMethods,
    openSearch: search.openSearch,
    closeSearch: search.closeSearch,
    openEditToolbar(ann) {
      if (ann.targetType !== 'source') { return }
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
    openElementEditToolbar() { /* no-op in source view */ }
  }))

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'textarea' || tag === 'input') { return }
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.key === 'd' && toolbarState) {
        e.preventDefault()
        handleTextAnnotate('DELETION')
      }
      if (isMod && e.key === 'k' && toolbarState) {
        e.preventDefault()
        setRequestedToolbarStep(prev => (prev ?? 0) + 1)
      }
      if (e.key === 'Escape' && toolbarState) {
        e.preventDefault()
        handleToolbarClose()
      }
      // Search shortcuts (work even without search input focus)
      if (search.isOpen) {
        if (e.key === 'F3') {
          e.preventDefault()
          search.stepMatch(e.shiftKey ? -1 : +1)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          search.closeSearch()
          return
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toolbarState, handleTextAnnotate, handleToolbarClose, setRequestedToolbarStep, search.isOpen, search.stepMatch, search.closeSearch])

  return (
    <div className="viewer-container">
      <div ref={containerRef} className="source-view">
        <table className="source-table">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="source-row">
                <td className="source-line-number" aria-hidden="true">{i + 1}</td>
                <td className="source-line-content" data-block-id={`source-line-${i}`}>
                  {line || '\n'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Toolbar
          highlightElement={toolbarState?.element ?? null}
          onAnnotate={handleTextAnnotate}
          onClose={handleToolbarClose}
          onDelete={handleToolbarDelete}
          requestedStep={requestedToolbarStep}
          editAnnotation={toolbarState?.mode === 'edit' ? toolbarState.annotation : null}
          elementMode={false}
          insertionMode={false}
          linkUrl={null}
          onOpenLink={null}
        />
      </div>
      {search.isOpen && (
        <SearchBar
          query={search.query}
          setQuery={search.setQuery}
          matchCount={search.matchCount}
          activeIndex={search.activeIndex}
          stepMatch={search.stepMatch}
          closeSearch={search.closeSearch}
        />
      )}
    </div>
  )
})
