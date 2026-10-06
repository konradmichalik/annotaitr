/**
 * A rendered PDF page, with a placeholder of the page's size while the
 * server is still rendering it, so the layout never jumps and the reviewer
 * sees that something is on its way. The placeholder is visual only: the
 * page navigation already announces the page, and a page from the cache
 * would otherwise queue a "loading" announcement it never needed.
 */
export default function PageImage({ src, alt, width, height, loadingLabel, loading, onLoad, onError }) {
  return (
    <div className="page-image" style={{ width, height }}>
      <img src={src} alt={alt} width={width} height={height} draggable={false} onLoad={onLoad} onError={onError} />
      {loading && (
        <div className="page-skeleton" aria-hidden="true">
          <span className="page-skeleton-label">{loadingLabel}…</span>
        </div>
      )}
    </div>
  )
}
