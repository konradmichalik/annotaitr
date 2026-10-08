import { useRef, useState, useEffect, useMemo } from 'react'
import { FileReferenceText } from './FileReferenceText.jsx'
import { getLabelColors } from '../utils/quickLabels.js'
import { LabelIcon } from './LabelIcon.jsx'
import { AgentNotes } from './AgentNotes.jsx'
import { GeneralCommentField } from './GeneralCommentField.jsx'
import { flashElement } from '../utils/flashElement.js'
import { noteNumbers, noteLocation, sortNotes } from '../utils/noteNumbers.js'
import { isNumbered } from '../../../shared/utils/intents.js'
import { noteType } from '../../../shared/utils/noteTypes.js'
import { PanelMenu } from '../../../shared/components/PanelMenu.jsx'
import { NoteCard } from '../../../shared/components/NoteCard.jsx'
import { PanelSwitch } from '../../../shared/components/PanelSwitch.jsx'
import { PanelEmpty } from '../../../shared/components/PanelEmpty.jsx'
import { GeneralCommentRow } from '../../../shared/components/GeneralCommentRow.jsx'
import { GeneralCommentCard } from '../../../shared/components/GeneralCommentCard.jsx'
import { useGeneralComment } from '../../../shared/hooks/useGeneralComment.js'
import { IntentIcon } from '../../../shared/components/IntentIcon.jsx'
import { intentBadgeStyle } from '../../../shared/utils/intents.js'

const MAX_IMPORT_SIZE = 5 * 1024 * 1024 // 5 MB
const ALT = navigator.platform?.includes('Mac') ? '⌥' : 'Alt'
const EMPTY_KEYS = [
  { key: 'V', label: 'Select text to comment on it or remove it' },
  { key: `${ALT}+click`, label: 'Insert text at a position' },
  { key: 'C', label: 'Pinpoint a paragraph, image or diagram' }
]

function markOf(ann) {
  const block = `[data-block-id="${ann.blockId}"]`
  if (ann.type === 'INSERTION' || ann.targetType === 'pinpoint') { return document.querySelector(block) }
  if (ann.targetType === 'image') { return document.querySelector(`${block} .annotatable-image-wrapper[data-image-src="${CSS.escape(ann.imageSrc)}"]`) }
  if (ann.targetType === 'diagram') { return document.querySelector(`${block} .mermaid-diagram`) || document.querySelector(block) }
  return document.querySelector(`[data-highlight-id="${ann.id}"]`)
}

function quoteOf(ann) {
  if (ann.type === 'INSERTION') { return `after “${(ann.afterContext || '').slice(-30)}”` }
  if (ann.targetType === 'image') { return ann.imageAlt || ann.imageSrc }
  if (ann.targetType === 'diagram') { return ann.originalText.split('\n')[0] }
  if (!ann.originalText) { return null }
  return `“${ann.originalText.length > 80 ? `${ann.originalText.slice(0, 80)}…` : ann.originalText}”`
}

function CardText({ ann }) {
  if (ann.label) {
    const colors = getLabelColors(ann.label.color)
    return (
      <span className="panel-label-pill" style={{ background: colors.bg, color: colors.text }}>
        <LabelIcon labelId={ann.label.id} />
        {ann.label.text}
      </span>
    )
  }
  return ann.text ? <p className="note-text"><FileReferenceText text={ann.text} /></p> : null
}

function Card({ ann, number, blocks, selected, onActivate, onEdit, onRemove }) {
  const { word, intent, shape } = noteType(ann)
  // A plain text selection says nothing a quote does not; an insertion or an image does.
  const location = [noteLocation(ann, blocks), shape === 'Text' ? null : shape].filter(Boolean).join(' · ')
  return (
    <NoteCard
      id={ann.id}
      number={number ?? null}
      badgeStyle={intentBadgeStyle(intent)}
      word={word}
      intent={intent}
      icon={<IntentIcon intent={intent} />}
      location={location || null}
      quote={quoteOf(ann)}
      selected={selected}
      onActivate={onActivate}
      onEdit={onEdit}
      onRemove={onRemove}
    >
      <CardText ann={ann} />
    </NoteCard>
  )
}

function readImport(event, onImport) {
  const file = event.target.files?.[0]
  if (!file) { return }
  if (file.size > MAX_IMPORT_SIZE) {
    alert('File too large. Maximum import size is 5 MB.')
    event.target.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    try {
      onImport(JSON.parse(reader.result))
    } catch {
      alert('Invalid JSON file')
    }
    event.target.value = ''
  }
  reader.onerror = () => {
    alert('Failed to read file')
    event.target.value = ''
  }
  reader.readAsText(file)
}

/**
 * The feedback panel: this file's notes (or, with several files open, all
 * of them, by file), the agent's notes from the last round and the general
 * comment of the active file. Numbers follow the feedback output.
 */
export function AnnotationPanel({
  files, activeFileIndex, annotations, blocks, selectedAnnotationId, onSelect, onOpenNote, onEdit, onDelete,
  onExport, onImport, generalComment, onSaveGeneralComment, generalDisabled, approves, collapsed, width
}) {
  const fileInputRef = useRef(null)
  const panelRef = useRef(null)
  const [tab, setTab] = useState('file')
  const isMultiFile = files.length > 1
  const showAll = isMultiFile && tab === 'all'
  // Scoped to the active file: an open draft is discarded on a file switch, so a save can never reach another file.
  const generalEditor = useGeneralComment({
    text: generalComment?.text || null,
    onSave: onSaveGeneralComment,
    disabled: generalDisabled || collapsed,
    scope: files[activeFileIndex]?.path
  })
  const hasGeneral = Boolean(generalComment?.text)

  const numbers = useMemo(() => noteNumbers(files.map(f => ({ annotations: f.annState.annotations, blocks: f.blocks || [] }))), [files])
  const agentNotes = useMemo(() => annotations.filter(a => a.type === 'NOTES'), [annotations])
  const fileNotes = useMemo(() => [
    ...sortNotes(annotations.filter(isNumbered), blocks),
    ...annotations.filter(a => a.targetType === 'global' && a !== generalComment)
  ], [annotations, blocks, generalComment])
  const allCount = numbers.size + files.reduce((sum, f) => sum + f.annState.annotations
    .filter(a => a.targetType === 'global').length, 0)

  // A note selected on the page brings its card into view.
  useEffect(() => {
    if (!selectedAnnotationId) { return }
    panelRef.current?.querySelector(`[data-annotation-id="${selectedAnnotationId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedAnnotationId])

  if (collapsed) {
    return null
  }

  const menuItems = [
    { id: 'export', label: 'Export annotations', disabled: annotations.every(a => a.type === 'NOTES'), onClick: onExport },
    { id: 'import', label: 'Import annotations (JSON)', onClick: () => fileInputRef.current?.click() }
  ]

  const activate = (ann) => {
    onSelect(ann.id)
    if (ann.targetType !== 'global') { flashElement(markOf(ann)) }
  }

  const generalCard = hasGeneral && (
    <GeneralCommentCard key="general-comment" annotation={generalComment} editor={generalEditor}>
      <p className="note-text"><FileReferenceText text={generalComment.text} /></p>
    </GeneralCommentCard>
  )
  const activeCards = fileNotes.map(ann => (
    <Card
      key={ann.id} ann={ann} number={numbers.get(ann.id)} blocks={blocks}
      selected={ann.id === selectedAnnotationId}
      onActivate={() => activate(ann)}
      onEdit={() => onEdit(ann.id)}
      onRemove={() => onDelete(ann.id)}
    />
  ))

  const activeList = [generalCard, ...activeCards]

  const allFiles = files.map((file, index) => {
    const own = file.annState.annotations
    const cards = index === activeFileIndex ? fileNotes : [
      ...sortNotes(own.filter(isNumbered), file.blocks || []),
      ...own.filter(a => a.targetType === 'global')
    ]
    if (cards.length === 0 && !(index === activeFileIndex && hasGeneral)) { return null }
    return (
      <section key={file.path} className="note-file" aria-label={file.path}>
        <h3 className="note-file-title">{file.path}</h3>
        <ul className="note-list">
          {index === activeFileIndex ? activeList : cards.map(ann => (
            <Card
              key={ann.id} ann={ann} number={numbers.get(ann.id)} blocks={file.blocks || []}
              selected={false}
              onActivate={() => onOpenNote(index, ann.id)}
            />
          ))}
        </ul>
      </section>
    )
  })

  const empty = fileNotes.length === 0 && !hasGeneral && (!showAll || allCount === 0)

  return (
    <aside ref={panelRef} className="annotation-panel" style={width ? { width: `${width}px` } : undefined}>
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={(event) => readImport(event, onImport)} />
      <div className="panel-header">
        <h2>Feedback</h2>
        <PanelMenu items={menuItems} />
      </div>
      {isMultiFile && (
        <PanelSwitch
          label="Feedback"
          panelId="feedback-tabpanel"
          value={tab}
          onChange={setTab}
          options={[{ id: 'file', label: `This file · ${fileNotes.length + (hasGeneral ? 1 : 0)}` }, { id: 'all', label: `All files · ${allCount}` }]}
        />
      )}
      <div className="panel-body" id="feedback-tabpanel" {...(isMultiFile ? { role: 'tabpanel', 'aria-labelledby': `panel-tab-${tab}` } : {})}>
        {empty && (
          <PanelEmpty lead="Every selection becomes a numbered note the agent applies to the file." keys={EMPTY_KEYS} approves={approves} />
        )}
        {!empty && (showAll ? allFiles : <ul className="note-list">{activeList}</ul>)}
        {!showAll && <AgentNotes notes={agentNotes} selectedAnnotationId={selectedAnnotationId} onSelect={onSelect} />}
      </div>
      <GeneralCommentRow editor={generalEditor} Field={GeneralCommentField} />
    </aside>
  )
}
