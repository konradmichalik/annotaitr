import { useRef, useState, useEffect, useMemo } from 'react'
import { useFileAutocomplete } from '../hooks/useFileAutocomplete.js'
import { FileAutocomplete } from './FileAutocomplete.jsx'
import { FileReferenceText } from './FileReferenceText.jsx'
import { TextareaBackdrop } from './TextareaBackdrop.jsx'
import { getLabelColors } from '../utils/quickLabels.js'
import { LabelIcon } from './LabelIcon.jsx'
import { PanelMenu } from '../../../shared/components/PanelMenu.jsx'

const MAX_IMPORT_SIZE = 5 * 1024 * 1024 // 5 MB

const flashElement = (el) => {
  if (!el) {return}
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.remove('flash-highlight')
  void el.offsetWidth
  el.classList.add('flash-highlight')
}

export function AnnotationPanel({
  annotations,
  selectedAnnotationId,
  onSelect,
  onEdit,
  onDelete,
  onExport,
  onImport,
  onAddGlobalComment,
  onEditGlobalComment,
  collapsed,
  width
}) {
  const fileInputRef = useRef(null)
  const [notesCollapsed, setNotesCollapsed] = useState(false)
  const [editingGlobalId, setEditingGlobalId] = useState(null)
  const [editingGlobalText, setEditingGlobalText] = useState('')
  const [globalCursorPos, setGlobalCursorPos] = useState(0)
  const globalEditRef = useRef(null)

  const globalAutocomplete = useFileAutocomplete(editingGlobalText, globalCursorPos)

  const applyGlobalAutocomplete = (index) => {
    globalAutocomplete.applyAccept(index, setEditingGlobalText, setGlobalCursorPos, globalEditRef)
  }

  const noteAnnotations = useMemo(
    () => annotations.filter(a => a.type === 'NOTES'),
    [annotations]
  )
  const userAnnotations = useMemo(
    () => annotations.filter(a => a.type !== 'NOTES'),
    [annotations]
  )
  const globalComments = useMemo(() => userAnnotations.filter(a => a.targetType === 'global'), [userAnnotations])
  const textAnnotations = useMemo(() => {
    const items = userAnnotations.filter(a => a.targetType !== 'global')
    return items.sort((a, b) =>
      (a.blockId || '').localeCompare(b.blockId || '', undefined, { numeric: true })
      || (a.startOffset || 0) - (b.startOffset || 0)
    )
  }, [userAnnotations])


  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) {return}
    if (file.size > MAX_IMPORT_SIZE) {
      alert('File too large. Maximum import size is 5 MB.')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        onImport(data)
      } catch {
        alert('Invalid JSON file')
      }
      e.target.value = ''
    }
    reader.onerror = () => {
      alert('Failed to read file')
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  useEffect(() => {
    if (editingGlobalId && globalEditRef.current) {
      globalEditRef.current.focus()
    }
  }, [editingGlobalId])

  // Auto-open edit for newly added empty global comments
  const prevGlobalCountRef = useRef(globalComments.length)
  useEffect(() => {
    if (globalComments.length > prevGlobalCountRef.current) {
      const newest = globalComments[globalComments.length - 1]
      if (newest && !newest.text) {
        setEditingGlobalId(newest.id)
        setEditingGlobalText('')
        setGlobalCursorPos(0)
      }
    }
    prevGlobalCountRef.current = globalComments.length
  }, [globalComments])

  const handleGlobalEditStart = (ann) => {
    const next = ann.text || ''
    setEditingGlobalId(ann.id)
    setEditingGlobalText(next)
    setGlobalCursorPos(next.length)
  }

  const handleGlobalEditSave = (id) => {
    if (editingGlobalText.trim()) {
      onEditGlobalComment(id, editingGlobalText)
    } else {
      onDelete(id)
    }
    setEditingGlobalId(null)
    setEditingGlobalText('')
  }

  // Bidirectional scroll: when selection changes from outside (e.g. highlight click in Viewer),
  // auto-scroll the panel to the matching annotation card
  const panelRef = useRef(null)
  useEffect(() => {
    if (!selectedAnnotationId || notesCollapsed) {return}
    const el = panelRef.current?.querySelector(`[data-annotation-id="${selectedAnnotationId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedAnnotationId, notesCollapsed])

  if (collapsed) {
    return null
  }

  const hasAnnotations = userAnnotations.length > 0

  const menuItems = [
    { id: 'export', label: 'Export annotations', disabled: !hasAnnotations, onClick: onExport },
    { id: 'import', label: 'Import annotations (JSON)', onClick: () => fileInputRef.current?.click() }
  ]

  return (
    <aside ref={panelRef} className="annotation-panel" style={width ? { width: `${width}px` } : undefined}>
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileSelect} />
      <div className="panel-header">
        <h2>Annotations</h2>
        <span className="panel-badge">{userAnnotations.length}</span>
        <button className="panel-icon-btn" onClick={onAddGlobalComment} title="Add general comment" aria-label="Add general comment">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </button>
        <PanelMenu items={menuItems} />
      </div>
      {globalComments.length > 0 && (
        <div className="panel-global-section">
          {globalComments.map(ann => (
            <div
              key={ann.id}
              data-annotation-id={ann.id}
              className={`panel-global-comment${ann.id === selectedAnnotationId ? ' selected' : ''}`}
              onClick={() => onSelect(ann.id)}
            >
              <div className="panel-item-header">
                <button
                  type="button"
                  className="panel-item-select"
                  aria-pressed={ann.id === selectedAnnotationId}
                  onClick={(e) => { e.stopPropagation(); onSelect(ann.id) }}
                >
                  <span className="panel-type-badge global">General</span>
                </button>
                <div className="panel-item-actions">
                  <button
                    type="button"
                    className="panel-edit-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleGlobalEditStart(ann)
                    }}
                    title="Edit comment"
                    aria-label="Edit comment"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="panel-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(ann.id)
                    }}
                    title="Remove comment"
                    aria-label="Remove comment"
                  >
                    ×
                  </button>
                </div>
              </div>
              {editingGlobalId === ann.id ? (
                <div className="panel-global-edit" style={{ position: 'relative' }}>
                  <div className="textarea-backdrop-wrap">
                    <TextareaBackdrop value={editingGlobalText} textareaRef={globalEditRef} />
                    <textarea
                      ref={globalEditRef}
                    className="panel-global-textarea"
                    value={editingGlobalText}
                    aria-expanded={globalAutocomplete.isOpen}
                    aria-autocomplete="list"
                    onChange={(e) => {
                      setEditingGlobalText(e.target.value)
                      setGlobalCursorPos(e.target.selectionStart)
                    }}
                    onSelect={(e) => setGlobalCursorPos(e.target.selectionStart)}
                    onKeyDown={(e) => {
                      const action = globalAutocomplete.handleKeyDown(e)
                      if (action === 'accept') {
                        applyGlobalAutocomplete()
                        return
                      }
                      if (action) { return }

                      if (e.key === 'Enter' && !e.nativeEvent?.isComposing && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        handleGlobalEditSave(ann.id)
                      }
                      if (e.key === 'Escape') {
                        setEditingGlobalId(null)
                        setEditingGlobalText('')
                      }
                    }}
                    placeholder="Add your comment..."
                    />
                  </div>
                  {globalAutocomplete.isOpen && (
                    <FileAutocomplete
                      items={globalAutocomplete.items}
                      activeIndex={globalAutocomplete.activeIndex}
                      onSelect={applyGlobalAutocomplete}
                    />
                  )}
                  <div className="panel-global-edit-actions">
                    <button
                      className="comment-popover-cancel-btn"
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingGlobalId(null)
                        setEditingGlobalText('')
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="panel-global-save-btn"
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleGlobalEditSave(ann.id)
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="panel-comment-text">
                  {ann.text ? <FileReferenceText text={ann.text} /> : <span className="panel-comment-empty">Click edit to add comment...</span>}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {textAnnotations.length === 0 && globalComments.length === 0 ? (
        <div className="panel-empty">
          <p>Select text, click an image, or click a diagram to add annotations.</p>
          <p className="panel-empty-hint">{navigator.platform?.includes('Mac') ? '⌥' : 'Alt'}+Click to insert text at any position.</p>
        </div>
      ) : textAnnotations.length === 0 ? null : (
      <ul className="panel-list" style={noteAnnotations.length > 0 ? { borderBottom: '1px solid var(--border)' } : undefined}>
        {textAnnotations.map(ann => {
          const isElement = ann.targetType === 'image' || ann.targetType === 'diagram' || ann.targetType === 'pinpoint'
          const isInsertion = ann.type === 'INSERTION'
          const badgeLabel = ann.type === 'DELETION' ? 'Delete' : ann.type === 'INSERTION' ? 'Insert' : ann.type === 'NOTES' ? 'Note' : 'Comment'
          const badgeClass = ann.type.toLowerCase()

          const handleItemClick = () => {
            onSelect(ann.id)
            if (isInsertion) {
              flashElement(document.querySelector(`[data-block-id="${ann.blockId}"]`))
            } else if (isElement) {
              let targetEl = null
              if (ann.targetType === 'image') {
                targetEl = document.querySelector(`[data-block-id="${ann.blockId}"] .annotatable-image-wrapper[data-image-src="${CSS.escape(ann.imageSrc)}"]`)
              } else if (ann.targetType === 'diagram') {
                targetEl = document.querySelector(`[data-block-id="${ann.blockId}"] .mermaid-diagram`)
                  || document.querySelector(`[data-block-id="${ann.blockId}"]`)
              } else if (ann.targetType === 'pinpoint') {
                targetEl = document.querySelector(`[data-block-id="${ann.blockId}"]`)
              }
              flashElement(targetEl)
            } else {
              flashElement(document.querySelector(`[data-highlight-id="${ann.id}"]`))
            }
          }

          return (
          <li
            key={ann.id}
            data-annotation-id={ann.id}
            className={`panel-item${ann.id === selectedAnnotationId ? ' selected' : ''} panel-item-${ann.type.toLowerCase()}`}
            onClick={handleItemClick}
          >
            <div className="panel-item-header">
              <button
                type="button"
                className="panel-item-select"
                aria-pressed={ann.id === selectedAnnotationId}
                onClick={(e) => { e.stopPropagation(); handleItemClick() }}
              >
                <span className={`panel-type-badge ${badgeClass}`}>
                  {badgeLabel}
                </span>
              </button>
              {ann.label && (
                <span
                  className="panel-label-pill"
                  style={{ background: getLabelColors(ann.label.color).bg, color: getLabelColors(ann.label.color).text }}
                >
                  <LabelIcon labelId={ann.label.id} />
                  {ann.label.text}
                </span>
              )}
              <div className="panel-item-actions">
                <button
                  className="panel-edit-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(ann.id)
                  }}
                  title="Edit annotation"
                  aria-label="Edit annotation"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                  </svg>
                </button>
                <button
                  className="panel-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(ann.id)
                  }}
                  title="Remove annotation"
                  aria-label="Remove annotation"
                >
                  ×
                </button>
              </div>
            </div>
            {ann.type === 'INSERTION' ? (
              <p className="panel-original-text">
                <span className="panel-element-icon">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m-8-8h16" />
                  </svg>
                </span>
                Insert after &ldquo;{(ann.afterContext || '').slice(-30)}&rdquo;
              </p>
            ) : ann.targetType === 'image' ? (
              <p className="panel-original-text">
                <span className="panel-element-icon">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </span>
                {ann.imageAlt || ann.imageSrc}
              </p>
            ) : ann.targetType === 'diagram' ? (
              <p className="panel-original-text">
                <span className="panel-element-icon">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-1zM7 10v4m0 0l5 3m-5-3l5-3"/>
                  </svg>
                </span>
                {ann.originalText.split('\n')[0]}
              </p>
            ) : (
              <p className="panel-original-text">"{ann.originalText.length > 80
                ? ann.originalText.slice(0, 80) + '...'
                : ann.originalText}"</p>
            )}
            {ann.text && !ann.label && <p className="panel-comment-text"><FileReferenceText text={ann.text} /></p>}
          </li>
          )
        })}
      </ul>
      )}
      {noteAnnotations.length > 0 && (
        <div className="panel-notes-section">
          <button
            className="panel-header panel-header-notes panel-header-collapsible"
            onClick={() => setNotesCollapsed(prev => !prev)}
            aria-expanded={!notesCollapsed}
          >
            <svg className={`panel-collapse-icon${notesCollapsed ? '' : ' panel-collapse-icon--expanded'}`} viewBox="0 0 16 16" width="10" height="10">
              <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2>Notes</h2>
            <span className="panel-badge">{noteAnnotations.length}</span>
          </button>
          {!notesCollapsed && (
            <>
              {noteAnnotations.map(ann => {
                const handleNoteClick = () => {
                  onSelect(ann.id)
                  if (ann.targetType === 'global') {return}
                  const el = document.querySelector(`[data-highlight-id="${ann.id}"]`)
                    || document.querySelector(`[data-block-id="${ann.blockId}"]`)
                  if (el) {
                    flashElement(el)
                  }
                }

                return (
                <div
                  key={ann.id}
                  data-annotation-id={ann.id}
                  className={`panel-note-item${ann.id === selectedAnnotationId ? ' selected' : ''}`}
                  onClick={handleNoteClick}
                >
                  <div className="panel-item-header">
                    <button
                      type="button"
                      className="panel-item-select"
                      aria-pressed={ann.id === selectedAnnotationId}
                      onClick={(e) => { e.stopPropagation(); handleNoteClick() }}
                    >
                      <span className="panel-type-badge notes">Note</span>
                    </button>
                  </div>
                  <p className="panel-comment-text">{ann.text}</p>
                  {ann.originalText && (
                    <p className="panel-original-text">"{ann.originalText.length > 60
                      ? ann.originalText.slice(0, 60) + '...'
                      : ann.originalText}"</p>
                  )}
                </div>
                )
              })}
              <p className="panel-notes-hint">Added by AI as feedback on applied changes.</p>
            </>
          )}
        </div>
      )}
    </aside>
  )
}
