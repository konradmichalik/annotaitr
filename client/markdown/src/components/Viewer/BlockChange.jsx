const SIGNS = { added: '+', changed: '±', removed: '−' }

function Label({ children }) {
  return <span className="visually-hidden">{children} </span>
}

/**
 * One added, removed or changed entry of a block comparison: a sign, the
 * current node inside `<ins>`, the earlier one inside `<del>`, struck through.
 * Sign and screen reader label carry the change, the diff colours only
 * support them. `labels` names the change (`added`, `removed`, `before`,
 * `after`), `render(node, earlier)` renders a node. Unmarked, the same
 * elements show only the current node, plain, so nothing inside is remounted
 * when the marks come and go.
 */
export function BlockChange({ entry, labels, render, marked = true }) {
  const { change } = entry
  const label = (text) => (marked ? <Label>{text}</Label> : null)
  return (
    <div className={marked ? `round-change round-change--${change}` : 'round-change-plain'}>
      <span className="round-change-sign" aria-hidden="true" hidden={!marked}>{SIGNS[change]}</span>
      {change === 'added' && <ins className="round-change-body">{label(labels.added)}{render(entry.node, false)}</ins>}
      {change === 'removed' && <del className="round-change-body">{label(labels.removed)}{render(entry.node, true)}</del>}
      {change === 'changed' && (
        <div className="round-change-body">
          <del className="round-change-before" hidden={!marked}>{label(labels.before)}{render(entry.before, true)}</del>
          <ins className="round-change-after">{label(labels.after)}{render(entry.node, false)}</ins>
        </div>
      )}
    </div>
  )
}
