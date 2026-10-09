import { useId, useMemo, useState } from 'react'
import { buildFileTree, filterFileTree } from '../utils/fileTree.js'
import { MarkReviewedButton } from './FilesSection.jsx'

const STATUS_WORD = { A: 'added', M: 'modified', D: 'deleted' }

const FolderIcon = () => (
  <svg className="changed-tree-folder-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12 5 5 9-10" />
  </svg>
)

function fileLabel(file, count, reviewed) {
  const notes = count === 1 ? '1 note' : `${count} notes`
  const state = [STATUS_WORD[file.status], !file.explained && 'not explained', reviewed && 'reviewed'].filter(Boolean)
  return `${file.path}, ${notes}, ${state.join(', ')}`
}

function TreeNodes({ nodes, depth, current, counts, reviewed, onSelect }) {
  return (
    <ul className="changed-tree" role="list">
      {nodes.map((node) => (node.type === 'folder' ? (
        <li key={node.path}>
          <span className="changed-tree-folder" style={{ paddingLeft: `${8 + depth * 14}px` }}>
            <FolderIcon />
            <span className="changed-tree-name">{node.name}</span>
          </span>
          <TreeNodes nodes={node.children} depth={depth + 1} current={current} counts={counts} reviewed={reviewed} onSelect={onSelect} />
        </li>
      ) : (
        <li key={node.path}>
          <button
            type="button"
            className={`changed-tree-file${node.path === current ? ' is-current' : ''}`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            aria-current={node.path === current ? 'true' : undefined}
            aria-label={fileLabel(node.file, counts.get(node.path) ?? 0, reviewed.has(node.path))}
            title={node.path}
            onClick={() => onSelect(node.path)}
          >
            <span className="changed-tree-status" aria-hidden="true">{node.file.status}</span>
            <span className="changed-tree-name">{node.name}</span>
            <span className="changed-tree-meta" aria-hidden="true">
              {!node.file.explained && <span className="changed-tree-pill">not explained</span>}
              {(counts.get(node.path) ?? 0) > 0 && <span className="files-item-count">{counts.get(node.path)}</span>}
              {reviewed.has(node.path) && <span className="files-item-check"><CheckIcon /></span>}
            </span>
          </button>
        </li>
      )))}
    </ul>
  )
}

/**
 * The left sidebar of a changes walkthrough: the overview, the changed files as
 * a folder tree with their notes and review state, and Mark file as reviewed
 * for the file in view.
 */
export function ChangedFilesPanel({ sections, counts, reviewed, current, onSelect, onToggleReviewed, width, collapsed }) {
  const headingId = useId()
  const filterId = useId()
  const [query, setQuery] = useState('')
  const tree = useMemo(() => buildFileTree(sections.files), [sections.files])
  const visible = useMemo(() => filterFileTree(tree, query), [tree, query])
  if (collapsed) { return null }

  const reviewedCount = sections.files.filter((f) => reviewed.has(f.path)).length
  return (
    <aside className="toc-panel changed-files-panel" style={width ? { width: `${width}px` } : undefined} aria-labelledby={headingId}>
      <div className="sidebar-heading">
        <h2 id={headingId}>Changed files</h2>
        <span className="sidebar-heading-meta">{reviewedCount} of {sections.files.length} reviewed</span>
      </div>
      <div className="changed-files-filter">
        <label htmlFor={filterId} className="visually-hidden">Filter changed files</label>
        <input id={filterId} type="search" placeholder="Filter files" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <nav className="changed-files-nav" aria-label="Changed files">
        <button
          type="button"
          className={`changed-tree-file changed-tree-overview${current === null ? ' is-current' : ''}`}
          aria-current={current === null ? 'true' : undefined}
          onClick={() => onSelect(null)}
        >
          <span className="changed-tree-name">Overview</span>
          {counts.overview > 0 && <span className="changed-tree-meta"><span className="files-item-count">{counts.overview}</span></span>}
        </button>
        <TreeNodes nodes={visible} depth={0} current={current} counts={counts.byPath} reviewed={reviewed} onSelect={onSelect} />
        {visible.length === 0 && <p className="changed-files-empty">No file matches “{query}”.</p>}
      </nav>
      {current !== null && (
        <MarkReviewedButton reviewed={reviewed.has(current)} onToggle={() => onToggleReviewed(current)} />
      )}
    </aside>
  )
}
