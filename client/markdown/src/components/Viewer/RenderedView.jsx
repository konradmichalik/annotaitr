import { Fragment, useCallback, useMemo, useState } from 'react'
import { ViewerBlocks } from './ViewerBlocks.jsx'
import { BlockChange } from './BlockChange.jsx'
import { FileRefsContext } from './fileRefsContext.js'
import { foldRuns } from '../../utils/fileVersions.js'

const LABELS = { added: 'Added:', removed: 'Removed:', before: 'Changed, before:', after: 'Now:' }

function FoldButton({ fold, open, onToggle }) {
  const count = fold.to - fold.from
  return (
    <button type="button" className="change-fold" aria-expanded={open} onClick={() => onToggle(fold.key)}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} />
      </svg>
      {count} unchanged {count === 1 ? 'block' : 'blocks'}
    </button>
  )
}

/** Which fold each entry sits in, by index. */
function foldsByIndex(folds) {
  return new Map(folds.flatMap((fold) => Array.from({ length: fold.to - fold.from }, (_, k) => [fold.from + k, fold])))
}

/**
 * The Read and Changes views of a markdown file's card in one rendering.
 * Read shows the file as it is now; Changes marks what changed against the
 * file as it was and folds long unchanged runs. Both share every element, and
 * the other view's parts are only hidden, so a highlight survives a switch.
 * The rendering stays mounted once loaded and is hidden on Diff.
 */
export function RenderedView({ entries, view, hidden, noted, blockProps }) {
  const [open, setOpen] = useState(() => new Set())
  const folds = useMemo(() => foldsByIndex(foldRuns(entries, noted)), [entries, noted])
  const toggle = useCallback((key) => setOpen((prev) => (prev.has(key) ? new Set([...prev].filter((k) => k !== key)) : new Set(prev).add(key))), [])
  const changes = view === 'changes'
  const render = (node, earlier) => <ViewerBlocks nodes={[node]} {...blockProps} earlier={earlier} diagrams={false} />
  // The file's own text is shown as it is, a path:line in it is not the agent's pointer.
  return (
    <FileRefsContext.Provider value={null}>
    <div className={`change-read${changes ? ' is-changes' : ''}`} hidden={hidden}>
      {entries.map((entry, i) => {
        const fold = folds.get(i)
        const folded = changes && fold && !open.has(fold.key)
        const gone = !changes && entry.change === 'removed'
        return (
          <Fragment key={entry.node.block.id}>
            {changes && fold?.from === i && <FoldButton fold={fold} open={!folded} onToggle={toggle} />}
            <div className={folded || gone ? 'change-entry is-off' : 'change-entry'} hidden={folded || gone}>
              {entry.change === 'same' ? render(entry.node, false) : <BlockChange entry={entry} labels={LABELS} render={render} marked={changes} />}
            </div>
          </Fragment>
        )
      })}
    </div>
    </FileRefsContext.Provider>
  )
}
