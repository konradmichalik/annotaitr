export function BlockHoverHint({ target }) {
  if (!target) { return null }

  const el = target.element

  return (
    <div
      className="block-hover-hint"
      style={{
        top: el.offsetTop,
        left: el.offsetLeft,
        width: el.offsetWidth,
        height: el.offsetHeight,
      }}
    >
      <span className="block-hover-hint-badge">Shift+click: annotate a block</span>
    </div>
  )
}
