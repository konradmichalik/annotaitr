import { ViewerBlocks } from './ViewerBlocks.jsx'

const SIGNS = { added: '+', changed: '±', removed: '−' }

// Read only: no handlers, so tables, formulas and images offer no annotate control.
const NOTHING = { annotatedImages: new Map(), annotatedDiagramBlocks: new Map(), annotatedMathBlocks: new Map(), noteBlockIds: new Map() }
const NO_HANDLERS = {}

function Blocks({ node, earlier = false, servers }) {
  return <ViewerBlocks nodes={[node]} annotated={NOTHING} handlers={NO_HANDLERS} earlier={earlier} {...servers} />
}

function Label({ children }) {
  return <span className="visually-hidden">{children} </span>
}

function ChangeBody({ entry, round, servers }) {
  if (entry.change === 'added') {
    return <ins className="round-change-body"><Label>Added since round {round}:</Label><Blocks node={entry.node} servers={servers} /></ins>
  }
  if (entry.change === 'removed') {
    return <del className="round-change-body"><Label>Removed since round {round}:</Label><Blocks node={entry.node} earlier servers={servers} /></del>
  }
  return (
    <div className="round-change-body">
      <del className="round-change-before"><Label>Changed since round {round}, before:</Label><Blocks node={entry.before} earlier servers={servers} /></del>
      <ins className="round-change-after"><Label>Now:</Label><Blocks node={entry.node} servers={servers} /></ins>
    </div>
  )
}

/**
 * The document with what changed since the last round marked: added and
 * changed blocks with a sign inside `<ins>`, removed ones and the earlier
 * version of a changed one inside `<del>`, struck through. Sign and screen
 * reader label carry the change, the diff colours only support them.
 */
export function RoundDiffView({ diff, plantumlServerUrl, krokiServerUrl }) {
  const servers = { plantumlServerUrl, krokiServerUrl }
  return (
    <div className="viewer-container">
      <article className="viewer-article round-diff" aria-label={`Changes since round ${diff.round}`}>
        {diff.entries.map((entry) => (entry.change === 'same'
          ? <Blocks key={entry.node.block.id} node={entry.node} servers={servers} />
          : (
            <div key={entry.node.block.id} className={`round-change round-change--${entry.change}`}>
              <span className="round-change-sign" aria-hidden="true">{SIGNS[entry.change]}</span>
              <ChangeBody entry={entry} round={diff.round} servers={servers} />
            </div>
          )))}
      </article>
    </div>
  )
}
