import { groupHtmlWrappers } from '../../utils/htmlWrappers.js'
import { ViewerBlocks } from './ViewerBlocks.jsx'

const STATUS_WORD = { A: 'Added', M: 'Modified', D: 'Deleted' }

function AgentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 7V4M9 13h.01M15 13h.01" />
    </svg>
  )
}

function Chevron({ open }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  )
}

/**
 * The file's blocks with every paragraph, which is always the agent's text,
 * set apart from the diffs and labelled with the agent's name.
 */
function FileBody({ blocks, agent, blockProps }) {
  return blocks.map((block) => (block.type === 'paragraph' ? (
    <div key={block.id} className="change-why">
      <span className="change-why-label"><AgentIcon />{agent}</span>
      <ViewerBlocks nodes={groupHtmlWrappers([block])} {...blockProps} />
    </div>
  ) : (
    <ViewerBlocks key={block.id} nodes={groupHtmlWrappers([block])} {...blockProps} />
  )))
}

function FileCard({ file, agent, collapsed, reviewed, onToggle, onReview, blockProps }) {
  const bodyId = `change-file-body-${file.heading.id}`
  const classes = ['change-file', collapsed && 'is-collapsed', !file.explained && 'is-unexplained'].filter(Boolean).join(' ')
  return (
    <section className={classes} data-path={file.path} aria-label={file.path}>
      {/* The header sits outside every data-block-id, so it never shifts the offsets of a selection. */}
      <div className="change-file-header">
        <button type="button" className="change-file-toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => onToggle(file.path)}>
          <Chevron open={!collapsed} />
          <span className="change-file-status" aria-label={STATUS_WORD[file.status]} title={STATUS_WORD[file.status]}>{file.status}</span>
          <span className="change-file-path">{file.path}</span>
        </button>
        <span className="change-file-counts">
          <span className="diff-count-add">+{file.added}</span>{' '}
          <span className="diff-count-del">{'−'}{file.removed}</span>
        </span>
        {!file.explained && <span className="change-pill">Not explained</span>}
        <button type="button" className="change-review-btn" aria-pressed={reviewed} onClick={() => onReview(file.path, !reviewed)}>
          <CheckIcon />
          {reviewed ? 'Reviewed' : 'Mark as reviewed'}
        </button>
      </div>
      <div id={bodyId} className="change-file-body">
        <FileBody blocks={file.blocks} agent={agent} blockProps={{ ...blockProps, inChangeCard: true }} />
      </div>
    </section>
  )
}

/**
 * A changes walkthrough laid out like a pull request: the agent's overview as
 * the first card, then one collapsible card per changed file. Collapsing only
 * hides the body, the blocks stay mounted for highlights, search and notes.
 */
export function ChangesBlocks({ sections, changes, ...blockProps }) {
  return (
    <>
      <section className="change-overview" aria-label="Overview">
        <span className="change-overview-label"><AgentIcon />Explained by {changes.agent}</span>
        <ViewerBlocks nodes={groupHtmlWrappers(sections.overview)} {...blockProps} />
      </section>
      {sections.files.map((file) => (
        <FileCard
          key={file.path}
          file={file}
          agent={changes.agent}
          collapsed={changes.collapsed.has(file.path)}
          reviewed={changes.reviewed.has(file.path)}
          onToggle={changes.toggle}
          onReview={changes.markReviewed}
          blockProps={blockProps}
        />
      ))}
    </>
  )
}
