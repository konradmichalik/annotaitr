import { ViewerBlocks } from './ViewerBlocks.jsx'

const SIGNS = { added: '+', changed: '±', removed: '−' }
const WORDS = { added: 'Added', changed: 'Changed', removed: 'Removed' }

// The view is read only: nothing in it is annotated and no click starts a note.
const NOTHING = { annotatedImages: new Map(), annotatedDiagramBlocks: new Map(), annotatedMathBlocks: new Map(), noteBlockIds: new Map() }
const IGNORE = () => {}
const HANDLERS = { onMathClick: IGNORE, onDiagramClick: IGNORE, onTableAnnotate: IGNORE, onImageClick: IGNORE, onTokenSelect: IGNORE, onNoteClick: IGNORE }

function Blocks({ node, servers }) {
  return <ViewerBlocks nodes={[node]} annotated={NOTHING} handlers={HANDLERS} {...servers} />
}

function ChangeEntry({ entry, round, servers }) {
  return (
    <div className={`round-change round-change--${entry.change}`}>
      <span className="round-change-sign" aria-hidden="true">{SIGNS[entry.change]}</span>
      <div className="round-change-body">
        <span className="visually-hidden">{WORDS[entry.change]} since round {round}</span>
        {entry.before && (
          <div className="round-change-before">
            <span className="visually-hidden">Before:</span>
            <Blocks node={entry.before} servers={servers} />
          </div>
        )}
        <div className={entry.before ? 'round-change-after' : undefined}>
          <Blocks node={entry.node} servers={servers} />
        </div>
      </div>
    </div>
  )
}

/**
 * The document with what changed since the last round marked: added and
 * changed blocks with a sign, removed ones and the earlier version of a
 * changed one struck through. Sign and screen reader label carry the change,
 * the diff colours only support them.
 */
export function RoundDiffView({ diff, plantumlServerUrl, krokiServerUrl }) {
  const servers = { plantumlServerUrl, krokiServerUrl }
  return (
    <div className="viewer-container">
      <article className="viewer-article round-diff" aria-label={`Changes since round ${diff.round}`}>
        {diff.entries.map((entry) => (entry.change === 'same'
          ? <Blocks key={entry.node.block.id} node={entry.node} servers={servers} />
          : <ChangeEntry key={entry.node.block.id} entry={entry} round={diff.round} servers={servers} />))}
      </article>
    </div>
  )
}
