import { useMemo } from 'react'
import { groupHtmlWrappers } from '../../utils/htmlWrappers.js'
import { FileRefsContext } from './fileRefsContext.js'
import { createFileLineRefFinder } from '../../utils/fileLineRefs.js'
import { parseDiffLines } from '../../utils/diffLines.js'
import { DiffCode } from './CodeBlock.jsx'
import { ViewerBlocks } from './ViewerBlocks.jsx'
import { InlineMarkdown } from './InlineMarkdown.jsx'
import { DiffCounts } from './DiffCounts.jsx'
import { CheckIcon } from '../FilesSection.jsx'
import { STATUS_LABEL, countFocus, isDiffBlock } from '../../utils/changeSections.js'
import { VIEWS, canRead } from '../../utils/fileVersions.js'
import { RenderedView } from './RenderedView.jsx'

function AgentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 7V4M9 13h.01M15 13h.01" />
    </svg>
  )
}

function FlagIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
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
  // Grouped first, so a quote keeps its child blocks and a paragraph inside it gets no label of its own.
  return groupHtmlWrappers(blocks).map((node) => (node.kind === 'block' && node.block.type === 'paragraph' ? (
    <div key={node.block.id} className="change-why">
      <span className="change-why-label"><AgentIcon />{agent.charAt(0).toUpperCase() + agent.slice(1)}</span>
      <ViewerBlocks nodes={[node]} {...blockProps} />
    </div>
  ) : (
    <ViewerBlocks key={node.block.id} nodes={[node]} {...blockProps} />
  )))
}

/** Whole file of a card: open or not, and its entry in the walkthrough's shared cache of whole-file diffs. */
function wholeFileOf(path, read) {
  const open = read.whole.has(path)
  const entry = read.full.entries.get(path)
  return { open, loading: open && Boolean(entry?.loading), diff: entry?.diff ?? null, error: open ? entry?.error ?? null : null }
}

function WholeFile({ whole }) {
  if (whole.error || whole.loading) {
    return <p className="change-whole-note" role="status">{whole.error ?? 'Loading the whole file…'}</p>
  }
  return (
    <div className="change-whole">
      <p className="change-whole-note">Whole file, to read. Notes go on the hunks: turn Whole file off to see them again.</p>
      <pre className="block-code block-diff"><code><DiffCode lines={parseDiffLines(whole.diff)} /></code></pre>
    </div>
  )
}

const VIEW_NAMES = { diff: 'Diff', read: 'Read', changes: 'Changes' }

/** Diff, Read or Changes, the views of a markdown file's card. P switches them too. */
function ViewSwitch({ shown, loading, onPick }) {
  return (
    <div className="change-view-switch" role="group" aria-label="View">
      {VIEWS.map((view) => (
        <button key={view} type="button" aria-pressed={shown === view} aria-busy={loading === view} aria-keyshortcuts="p" title={`${VIEW_NAMES[view]} (P)`} onClick={() => onPick(view)}>
          {VIEW_NAMES[view]}
        </button>
      ))}
    </div>
  )
}

function FileCard({ file, agent, collapsed, reviewed, onToggle, onReview, read, noted, blockProps }) {
  const whole = wholeFileOf(file.path, read)
  const readable = canRead(file)
  const entries = read.changesByPath.get(file.path)
  const wanted = readable ? read.viewOf(file) : 'diff'
  const view = entries ? wanted : 'diff'
  const reading = view !== 'diff'
  const status = readable ? read.statusOf(file) : null
  const loading = status && !read.full.entries.get(file.path)?.error ? wanted : null
  const bodyId = `change-file-body-${file.heading.id}`
  const classes = ['change-file', collapsed && 'is-collapsed', !file.explained && 'is-unexplained', file.attention === 'high' && 'is-focus', whole.open && !reading && 'is-whole', reading && 'is-read'].filter(Boolean).join(' ')
  return (
    <section className={classes} data-path={file.path} aria-label={file.path} tabIndex={-1}>
      {/* The header sits outside every data-block-id, so it never shifts the offsets of a selection. */}
      <div className="change-file-header">
        <button type="button" className="change-file-toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => onToggle(file.path)}>
          <Chevron open={!collapsed} />
          <span className="change-file-status" aria-hidden="true" title={STATUS_LABEL[file.status]}>{file.status}</span>
          <span className="visually-hidden">{STATUS_LABEL[file.status]}: </span>
          <span className="change-file-path">{file.path}</span>
        </button>
        {file.attention === 'high' && <span className="change-flag" role="img" aria-label="Check closely" title="Check closely"><FlagIcon size={15} /></span>}
        <DiffCounts className="change-file-counts" added={file.added} removed={file.removed} />
        {!file.explained && <span className="change-pill">Not explained</span>}
        {readable && <ViewSwitch shown={view} loading={loading} onPick={(picked) => read.pick(file.path, picked)} />}
        {file.hasDiff && !reading && (
          <button type="button" className="change-whole-btn" aria-pressed={whole.open} aria-busy={whole.loading} onClick={() => read.toggleWhole(file.path)}>
            Whole file
          </button>
        )}
        <button type="button" className="change-review-btn" aria-pressed={reviewed} onClick={() => onReview(file.path, !reviewed)}>
          <CheckIcon />
          {reviewed ? 'Reviewed' : 'Mark as reviewed'}
        </button>
      </div>
      <div id={bodyId} className="change-file-body">
        {file.focusBlock && (
          <div className="change-why change-focus">
            <span className="change-focus-label" aria-hidden="true"><FlagIcon />Check closely</span>
            <ViewerBlocks nodes={groupHtmlWrappers([file.focusBlock])} {...blockProps} inChangeCard />
          </div>
        )}
        <FileBody blocks={file.blocks} agent={agent} blockProps={{ ...blockProps, inChangeCard: true }} />
        {status && <p className="change-whole-note change-read-status" role="status">{status}</p>}
        {entries && <RenderedView entries={entries} view={view} hidden={!reading} noted={noted} blockProps={blockProps} />}
        {whole.open && !reading && <WholeFile whole={whole} />}
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
      read={changes.read}
      noted={changes.noted}
      blockProps={blockProps}
    />
  ))
}

/** One of the agent's groups: its title and reason, how many of its files are reviewed, then their cards. */
function GroupSection({ group, changes, blockProps }) {
  const reviewedCount = group.files.filter((f) => changes.reviewed.has(f.path)).length
  const focusCount = countFocus(group.files)
  return (
    <section className="change-group" aria-label={group.title}>
      <div className="change-group-header">
        <ViewerBlocks nodes={groupHtmlWrappers([group.heading])} {...blockProps} />
        <span className="change-group-meta">{reviewedCount} of {group.files.length} reviewed{focusCount > 0 && ` · ${focusCount} to check closely`}</span>
      </div>
      {group.blocks.length > 0 && <FileBody blocks={group.blocks} agent={changes.agent} blockProps={blockProps} />}
      <FileCards files={group.files} changes={changes} blockProps={blockProps} />
    </section>
  )
}

export function ReviewFocus({ files, onSelect }) {
  const focus = files.filter((f) => f.attention === 'high')
  if (focus.length === 0) { return null }
  const rest = files.length - focus.length
  return (
    <div className="change-focus-box" role="group" aria-labelledby="change-focus-title">
      <div className="change-focus-box-header">
        <h2 id="change-focus-title">Review focus: {focus.length} of {files.length} {files.length === 1 ? 'file' : 'files'} to check closely</h2>
        {rest > 0 && <span>The other {rest} stay visible and reviewable like any file.</span>}
      </div>
      {focus.map((file) => (
        <div key={file.path} className="change-focus-row">
          <button type="button" className="change-focus-jump" onClick={() => onSelect(file.path)}>
            <span className="change-focus-pill"><FlagIcon size={12} />Check closely</span>
            <span className="change-focus-path">{file.path}</span>
          </button>
          <div className="change-focus-why"><InlineMarkdown text={file.focusWhy} /></div>
        </div>
      ))}
    </div>
  )
}

/** The overview blocks with the review focus in front of the facts about the comparison. */
function OverviewBlocks({ sections, changes, blockProps }) {
  const split = sections.overview.findIndex((b) => b.type === 'paragraph' && b.content.startsWith('**Compared:**'))
  const at = split === -1 ? sections.overview.length : split
  return (
    <>
      <ViewerBlocks nodes={groupHtmlWrappers(sections.overview.slice(0, at))} {...blockProps} />
      <ReviewFocus files={sections.files} onSelect={changes.select} />
      <ViewerBlocks nodes={groupHtmlWrappers(sections.overview.slice(at))} {...blockProps} />
    </>
  )
}

/**
 * A changes walkthrough laid out like a pull request: the agent's overview as
 * the first card, then one collapsible card per changed file, under the
 * agent's groups when it gave any. Collapsing only hides the body, the blocks
 * stay mounted for highlights, search and notes.
 */
export function ChangesBlocks({ sections, changes, ...blockProps }) {
  const fileRefs = useMemo(() => {
    const diffs = new Map(sections.files.map((file) => [
      file.path,
      file.blocks.filter((b) => !b.parentId && isDiffBlock(b)).map((b) => b.content).join('\n')
    ]))
    const jump = (path) => {
      changes.select(path)
      // The scroll alone leaves keyboard focus on the reference, so the next Tab would continue in the overview.
      document.querySelector(`.change-file[data-path="${CSS.escape(path)}"]`)?.focus({ preventScroll: true })
    }
    return { find: createFileLineRefFinder(new Set(diffs.keys())), diffOf: (path) => diffs.get(path) ?? '', jump }
  }, [sections, changes])

  return (
    <FileRefsContext.Provider value={fileRefs}>
      <section className="change-overview" aria-label="Overview">
        <span className="change-overview-label"><AgentIcon />Explained by {changes.agent}</span>
        <OverviewBlocks sections={sections} changes={changes} blockProps={blockProps} />
      </section>
      {sections.groups.length > 0 ? (
        <>
          <FileCards files={sections.ungrouped} changes={changes} blockProps={blockProps} />
          {sections.groups.map((group) => <GroupSection key={group.heading.id} group={group} changes={changes} blockProps={blockProps} />)}
        </>
      ) : <FileCards files={sections.files} changes={changes} blockProps={blockProps} />}
    </FileRefsContext.Provider>
  )
}
