import { ViewerBlocks } from './ViewerBlocks.jsx'
import { BlockChange } from './BlockChange.jsx'

// Read only: no handlers, so tables, formulas and images offer no annotate control.
const NOTHING = { annotatedImages: new Map(), annotatedDiagramBlocks: new Map(), annotatedMathBlocks: new Map(), noteBlockIds: new Map() }
const NO_HANDLERS = {}

function Blocks({ node, earlier = false, servers }) {
  return <ViewerBlocks nodes={[node]} annotated={NOTHING} handlers={NO_HANDLERS} earlier={earlier} {...servers} />
}

const labelsOf = (round) => ({
  added: `Added since round ${round}:`,
  removed: `Removed since round ${round}:`,
  before: `Changed since round ${round}, before:`,
  after: 'Now:'
})

/**
 * The document with what changed since the last round marked, read only:
 * added and changed blocks with a sign inside `<ins>`, removed ones and the
 * earlier version of a changed one inside `<del>`, struck through.
 */
export function RoundDiffView({ diff, plantumlServerUrl, krokiServerUrl }) {
  const servers = { plantumlServerUrl, krokiServerUrl }
  const labels = labelsOf(diff.round)
  const render = (node, earlier) => <Blocks node={node} earlier={earlier} servers={servers} />
  return (
    <div className="viewer-container">
      <article className="viewer-article round-diff" aria-label={`Changes since round ${diff.round}`}>
        {diff.entries.map((entry) => (entry.change === 'same'
          ? <Blocks key={entry.node.block.id} node={entry.node} servers={servers} />
          : <BlockChange key={entry.node.block.id} entry={entry} labels={labels} render={render} />))}
      </article>
    </div>
  )
}
