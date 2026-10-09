import { useId, useMemo, useState } from 'react'
import { buildFileTree, filterFileTree, nameParts } from '../utils/fileTree.js'
import { CheckIcon, MarkReviewedButton } from './FilesSection.jsx'
import { DiffCounts } from './Viewer/DiffCounts.jsx'
import { STATUS_LABEL } from '../utils/changeSections.js'

const FolderIcon = () => (
  <svg className="changed-tree-folder-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)

const Chevron = ({ open }) => (
  <svg className="changed-tree-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} />
  </svg>
)

function fileLabel(file, count, reviewed) {
  const notes = count === 1 ? '1 note' : `${count} notes`
  const state = [STATUS_LABEL[file.status].toLowerCase(), !file.explained && 'not explained', reviewed && 'reviewed'].filter(Boolean)
  return `${file.path}, ${notes}, +${file.added} \u2212${file.removed}, ${state.join(', ')}`
}

/** A name with line break opportunities only where a break reads well. */
function Name({ name }) {
  return (
    <span className="changed-tree-name">
      {nameParts(name).map((part, i) => <span key={i}>{i > 0 && <wbr />}{part}</span>)}
    </span>
  )
}

function TreeNodes({ nodes, depth, current, counts, reviewed, closed, onToggleFolder, onSelect }) {
  const childProps = { current, counts, reviewed, closed, onToggleFolder, onSelect }
  return (
    <ul className="changed-tree" role="list">
      {nodes.map((node) => (node.type === 'folder' ? (
        <li key={node.path}>
          <button
            type="button"
            className="changed-tree-folder"
            style={{ paddingLeft: `${4 + depth * 14}px` }}
            aria-expanded={!closed.has(node.path)}
            title={node.path}
            onClick={() => onToggleFolder(node.path)}
          >
            <Chevron open={!closed.has(node.path)} />
            <FolderIcon />
            <Name name={node.name} />
          </button>
          {!closed.has(node.path) && <TreeNodes nodes={node.children} depth={depth + 1} {...childProps} />}
        </li>
      ) : (
        <li key={node.path}>
          <button
            type="button"
            className={`changed-tree-file${node.path === current ? ' is-current' : ''}`}
            style={{ paddingLeft: `${22 + depth * 14}px` }}
            aria-current={node.path === current ? 'true' : undefined}
            aria-label={fileLabel(node.file, counts.get(node.path) ?? 0, reviewed.has(node.path))}
            title={node.path}
            onClick={() => onSelect(node.path)}
          >
            <span className="changed-tree-status" aria-hidden="true" title={STATUS_LABEL[node.file.status]}>{node.file.status}</span>
            <Name name={node.name} />
            <span className="changed-tree-meta" aria-hidden="true">
              <DiffCounts className="changed-tree-counts" added={node.file.added} removed={node.file.removed} />
              {!node.file.explained && <span className="changed-tree-unexplained" title="Not explained" />}
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
  const [closedFolders, setClosedFolders] = useState(() => new Set())
  const toggleFolder = (path) => setClosedFolders((prev) => {
    const next = new Set(prev)
    if (next.has(path)) { next.delete(path) } else { next.add(path) }
    return next
  })
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
          <Name name="Overview" />
          {counts.overview > 0 && <span className="changed-tree-meta"><span className="files-item-count">{counts.overview}</span></span>}
        </button>
        <TreeNodes
          nodes={visible}
          depth={0}
          current={current}
          counts={counts.byPath}
          reviewed={reviewed}
          closed={query.trim() ? new Set() : closedFolders}
          onToggleFolder={toggleFolder}
          onSelect={onSelect}
        />
        {visible.length === 0 && <p className="changed-files-empty">No file matches “{query}”.</p>}
      </nav>
      {current !== null && (
        <MarkReviewedButton reviewed={reviewed.has(current)} onToggle={() => onToggleReviewed(current)} />
      )}
    </aside>
  )
}
