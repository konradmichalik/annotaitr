import { useId, useMemo, useRef, useState } from 'react'
import { buildFileTree, filterFileTree, nameParts, FILE_PAD, FOLDER_PAD, TREE_INDENT } from '../utils/fileTree.js'
import { CheckIcon, MarkReviewedButton } from './FilesSection.jsx'
import { DiffCounts } from './Viewer/DiffCounts.jsx'
import { STATUS_LABEL, countFocus } from '../utils/changeSections.js'

const NO_FILES = []

const FolderIcon = () => (
  <svg className="changed-tree-folder-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)

const FlagIcon = ({ className }) => (
  <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
)

const Chevron = ({ open }) => (
  <svg className="changed-tree-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} />
  </svg>
)

function fileLabel(file, count, reviewed) {
  const notes = count === 1 ? '1 note' : `${count} notes`
  const weight = file.attention === 'high' ? 'check closely' : null
  const state = [STATUS_LABEL[file.status].toLowerCase(), !file.explained && 'not explained', reviewed && 'reviewed'].filter(Boolean)
  return `${file.path}, ${weight ? `${weight}, ` : ''}${notes}, +${file.added} \u2212${file.removed}, ${state.join(', ')}`
}

/** A name with line break opportunities only where a break reads well. */
function Name({ name }) {
  return (
    <span className="changed-tree-name">
      {nameParts(name).map((part, i) => <span key={i}>{i > 0 && <wbr />}{part}</span>)}
    </span>
  )
}

function ChangedFileRow({ node, depth, current, counts, reviewed, onSelect }) {
  return (
    <button
      type="button"
      className={`changed-tree-file${node.path === current ? ' is-current' : ''}`}
      style={{ paddingLeft: `${FILE_PAD + depth * TREE_INDENT}px` }}
      aria-current={node.path === current ? 'true' : undefined}
      aria-label={fileLabel(node.file, counts.get(node.path) ?? 0, reviewed.has(node.path))}
      title={node.path}
      onClick={() => onSelect(node.path)}
    >
      <span className="changed-tree-label">
        <span className="changed-tree-status" aria-hidden="true" title={STATUS_LABEL[node.file.status]}>{node.file.status}</span>
        <Name name={node.name} />
      </span>
      <span className="changed-tree-meta" aria-hidden="true">
        {node.file.attention === 'high' && <span className="changed-tree-flag" title="Check closely"><FlagIcon /></span>}
        <DiffCounts className="changed-tree-counts" added={node.file.added} removed={node.file.removed} />
        {!node.file.explained && <span className="changed-tree-unexplained" title="Not explained" />}
        {(counts.get(node.path) ?? 0) > 0 && <span className="files-item-count">{counts.get(node.path)}</span>}
        {reviewed.has(node.path) && <span className="files-item-check"><CheckIcon /></span>}
      </span>
    </button>
  )
}

function RepoFileRow({ node, depth, current, onOpen }) {
  const { omitted } = node.file
  return (
    <button
      type="button"
      className={`changed-tree-file${node.path === current ? ' is-current' : ''}`}
      style={{ paddingLeft: `${FILE_PAD + depth * TREE_INDENT}px` }}
      data-repo-path={node.path}
      aria-current={node.path === current ? 'true' : undefined}
      aria-label={omitted ? `${node.name}, not shown: ${omitted}` : undefined}
      title={node.path}
      onClick={() => onOpen(node.path)}
    >
      <span className="changed-tree-label"><Name name={node.name} /></span>
      {omitted && <span className="changed-tree-note" aria-hidden="true">{omitted}</span>}
    </button>
  )
}

/** What the sidebar says about the list of all files, in a region that is always there so a screen reader announces the change. */
function repoStatus({ status, files, truncated }) {
  if (status === 'loading') { return 'Loading the files…' }
  if (status === 'error') { return 'The files could not be loaded.' }
  if (status !== 'ready') { return '' }
  return `${files.length} ${files.length === 1 ? 'file' : 'files'}${truncated ? ', the list is cut off' : ''}`
}

function TreeNodes({ nodes, depth, closed, onToggleFolder, renderFile }) {
  const childProps = { closed, onToggleFolder, renderFile }
  return (
    <ul className="changed-tree" role="list">
      {nodes.map((node) => (node.type === 'folder' ? (
        <li key={node.path}>
          <button
            type="button"
            className="changed-tree-folder"
            style={{ paddingLeft: `${FOLDER_PAD + depth * TREE_INDENT}px` }}
            aria-expanded={!closed.has(node.path)}
            title={node.path}
            onClick={() => onToggleFolder(node.path)}
          >
            <span className="changed-tree-label">
              <Chevron open={!closed.has(node.path)} />
              <FolderIcon />
              <Name name={node.name} />
            </span>
          </button>
          {!closed.has(node.path) && <TreeNodes nodes={node.children} depth={depth + 1} {...childProps} />}
        </li>
      ) : (
        <li key={node.path}>{renderFile(node, depth)}</li>
      )))}
    </ul>
  )
}

/**
 * The left sidebar of a changes walkthrough: the overview, the changed files as
 * a folder tree with their notes and review state, and Mark file as reviewed
 * for the file in view.
 */
export function ChangedFilesPanel({ sections, counts, reviewed, current, onSelect, onToggleReviewed, width, collapsed, repo = null }) {
  const headingId = useId()
  const filterId = useId()
  const filterRef = useRef(null)
  const [scope, setScope] = useState('changes')
  const [query, setQuery] = useState('')
  const [onlyFocus, setOnlyFocus] = useState(false)
  const [closedFolders, setClosedFolders] = useState(() => new Set())
  const toggleFolder = (path) => setClosedFolders((prev) => {
    const next = new Set(prev)
    if (next.has(path)) { next.delete(path) } else { next.add(path) }
    return next
  })
  const all = repo !== null && scope === 'all'
  const focusCount = countFocus(sections.files)
  const shown = useMemo(() => (onlyFocus ? sections.files.filter((f) => f.attention === 'high') : sections.files), [sections.files, onlyFocus])
  const repoFiles = repo?.files ?? NO_FILES
  const tree = useMemo(() => buildFileTree(all ? repoFiles : shown), [all, repoFiles, shown])
  const visible = useMemo(() => filterFileTree(tree, query), [tree, query])
  if (collapsed) { return null }

  const showAll = () => {
    setScope('all')
    repo.load()
  }
  const renderFile = all
    ? (node, depth) => <RepoFileRow node={node} depth={depth} current={repo.current} onOpen={repo.onOpen} />
    : (node, depth) => <ChangedFileRow node={node} depth={depth} current={current} counts={counts.byPath} reviewed={reviewed} onSelect={onSelect} />
  const reviewedCount = sections.files.filter((f) => reviewed.has(f.path)).length
  return (
    <aside className="toc-panel changed-files-panel" style={width ? { width: `${width}px` } : undefined} aria-labelledby={headingId}>
      <div className="sidebar-heading">
        <h2 id={headingId}>{all ? 'All files' : 'Changed files'}</h2>
        {!all && <span className="sidebar-heading-meta">{reviewedCount} of {sections.files.length} reviewed</span>}
      </div>
      {repo && (
        <div className="changed-files-scope" role="group" aria-label="Files to show">
          <button type="button" aria-pressed={!all} onClick={() => { setScope('changes'); repo.onOpen(null) }}>Changes</button>
          <button type="button" aria-pressed={all} onClick={showAll}>All files</button>
        </div>
      )}
      <div className="changed-files-filter">
        <label htmlFor={filterId} className="visually-hidden">{all ? 'Filter all files' : 'Filter changed files'}</label>
        <input ref={filterRef} id={filterId} type="search" placeholder="Filter files" value={query} onChange={(e) => setQuery(e.target.value)} />
        {!all && focusCount > 0 && (
          <button type="button" className="changed-files-focus" aria-pressed={onlyFocus} onClick={() => setOnlyFocus((on) => !on)}>
            <FlagIcon />
            Only files to check closely
            <span className="changed-files-focus-count">{focusCount}</span>
          </button>
        )}
      </div>
      <nav className="changed-files-nav" aria-label={all ? 'All files' : 'Changed files'}>
        {!all && (
          <button
            type="button"
            className={`changed-tree-file changed-tree-overview${current === null ? ' is-current' : ''}`}
            aria-current={current === null ? 'true' : undefined}
            onClick={() => onSelect(null)}
          >
            <Name name="Overview" />
            {counts.overview > 0 && <span className="changed-tree-meta"><span className="files-item-count">{counts.overview}</span></span>}
          </button>
        )}
        <TreeNodes
          nodes={visible}
          depth={0}
          closed={query.trim() ? new Set() : closedFolders}
          onToggleFolder={toggleFolder}
          renderFile={renderFile}
        />
        {all && <p className="visually-hidden" role="status">{repoStatus(repo)}</p>}
        {all && repo.status === 'loading' && <p className="changed-files-empty">Loading the files…</p>}
        {all && repo.status === 'error' && (
          <p className="changed-files-empty">
            The files could not be loaded. <button type="button" className="changed-files-retry" onClick={() => { filterRef.current?.focus(); repo.load() }}>Try again</button>
          </p>
        )}
        {all && repo.truncated && <p className="changed-files-empty">The list is cut off, not every file is shown.</p>}
        {visible.length === 0 && (!all || repo.status === 'ready') && (
          <p className="changed-files-empty">{query.trim() ? `No file matches “${query}”.` : 'No files.'}</p>
        )}
      </nav>
      {!all && current !== null && (
        <MarkReviewedButton reviewed={reviewed.has(current)} onToggle={() => onToggleReviewed(current)} />
      )}
    </aside>
  )
}
