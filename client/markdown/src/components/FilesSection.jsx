import { useId } from 'react'
import { filesOverview } from '../utils/filesOverview.js'

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const STATE_WORDS = { reviewed: 'reviewed', opened: 'opened', 'not-opened': 'not opened' }

/** The sidebar's Files section: every file of the review, its notes and whether it is reviewed. */
export function FilesSection({ files, activeFileIndex, onSelectFile }) {
  const headingId = useId()
  const { rows, summary } = filesOverview(files)
  return (
    <section className="files-section" aria-labelledby={headingId}>
      <div className="sidebar-heading">
        <h2 id={headingId}>Files</h2>
        <span className="sidebar-heading-meta">{summary}</span>
      </div>
      <ul className="files-list">
        {rows.map((row, index) => {
          const active = index === activeFileIndex
          const notes = row.count === 1 ? '1 note' : `${row.count} notes`
          return (
            <li key={row.path}>
              <button
                type="button"
                className={`files-item${active ? ' files-item--active' : ''}`}
                aria-current={active ? 'true' : undefined}
                aria-label={`${row.name}, ${notes}, ${STATE_WORDS[row.state]}`}
                title={row.path}
                onClick={() => onSelectFile(index)}
              >
                <span className="files-item-name">{row.name}</span>
                {row.count > 0 && <span className="files-item-count">{row.count}</span>}
                {row.state === 'reviewed' && <span className="files-item-check"><CheckIcon /></span>}
                {row.state === 'not-opened' && <span className="files-item-state">not opened</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The sidebar's last row: marks the active file as reviewed, or takes that back. */
export function MarkReviewedButton({ reviewed, onToggle }) {
  return (
    <div className="files-footer">
      <button type="button" className="files-review-btn" aria-pressed={reviewed} onClick={onToggle}>
        <CheckIcon />
        {reviewed ? 'Reviewed' : 'Mark file as reviewed'}
      </button>
    </div>
  )
}
