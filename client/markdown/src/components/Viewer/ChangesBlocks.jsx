import { groupHtmlWrappers } from '../../utils/htmlWrappers.js'
import { ViewerBlocks } from './ViewerBlocks.jsx'
import { DiffCounts } from './DiffCounts.jsx'
import { CheckIcon } from '../FilesSection.jsx'
import { STATUS_LABEL } from '../../utils/changeSections.js'

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

/**
 * The file's blocks with every paragraph, which is always the agent's text,
 * set apart from the diffs and labelled with the agent's name.
 */
function FileBody({ blocks, agent, blockProps }) {
  return blocks.map((block) => (block.type === 'paragraph' ? (
    <div key={block.id} className="change-why">
      <span className="change-why-label"><AgentIcon />{agent.charAt(0).toUpperCase() + agent.slice(1)}</span>
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
          <span className="change-file-status" aria-hidden="true" title={STATUS_LABEL[file.status]}>{file.status}</span>
          <span className="visually-hidden">{STATUS_LABEL[file.status]}: </span>
          <span className="change-file-path">{file.path}</span>
        </button>
        <DiffCounts className="change-file-counts" added={file.added} removed={file.removed} />
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

function FileCards({ files, changes, blockProps }) {
  return files.map((file) => (
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
  ))
}

/** One of the agent's groups: its title and reason, how many of its files are reviewed, then their cards. */
function GroupSection({ group, changes, blockProps }) {
  const reviewedCount = group.files.filter((f) => changes.reviewed.has(f.path)).length
  return (
    <section className="change-group" aria-label={group.title}>
      <div className="change-group-header">
        <ViewerBlocks nodes={groupHtmlWrappers([group.heading])} {...blockProps} />
        <span className="change-group-meta">{reviewedCount} of {group.files.length} reviewed</span>
      </div>
      {group.blocks.length > 0 && <FileBody blocks={group.blocks} agent={changes.agent} blockProps={blockProps} />}
      <FileCards files={group.files} changes={changes} blockProps={blockProps} />
    </section>
  )
}

/**
 * A changes walkthrough laid out like a pull request: the agent's overview as
 * the first card, then one collapsible card per changed file, under the
 * agent's groups when it gave any. Collapsing only hides the body, the blocks
 * stay mounted for highlights, search and notes.
 */
export function ChangesBlocks({ sections, changes, ...blockProps }) {
  return (
    <>
      <section className="change-overview" aria-label="Overview">
        <span className="change-overview-label"><AgentIcon />Explained by {changes.agent}</span>
        <ViewerBlocks nodes={groupHtmlWrappers(sections.overview)} {...blockProps} />
      </section>
      {sections.groups.length > 0
        ? sections.groups.map((group) => <GroupSection key={group.heading.id} group={group} changes={changes} blockProps={blockProps} />)
        : <FileCards files={sections.files} changes={changes} blockProps={blockProps} />}
    </>
  )
}
