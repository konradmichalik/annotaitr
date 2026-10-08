const THUMB_WIDTH = 112

/**
 * The images of a set as a column of thumbnails, each with its number and
 * how many annotations it carries. Shares its look with the PDF page strip.
 */
export default function ImageStrip({ images, current, counts, onSelect }) {
  return (
    <nav className="page-strip" aria-label="Images">
      <ol className="page-strip-list">
        {images.map(({ label, width, height }, index) => {
          const count = counts[index] ?? 0
          const isCurrent = index === current
          const description = [
            `Image ${index + 1}: ${label}`,
            count > 0 && `${count} annotation${count === 1 ? '' : 's'}`
          ].filter(Boolean).join(', ')
          return (
            <li key={label + index}>
              <button
                type="button"
                className={`page-strip-item${isCurrent ? ' page-strip-item--current' : ''}`}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={description}
                title={description}
                onClick={() => onSelect(index)}
              >
                <img
                  className="page-strip-thumb"
                  src={`/api/image?index=${index}`}
                  alt=""
                  loading="lazy"
                  width={THUMB_WIDTH}
                  height={Math.round((THUMB_WIDTH * height) / width)}
                  draggable={false}
                />
                <span className="page-strip-number" aria-hidden="true">{index + 1}</span>
                {count > 0 && <span className="page-strip-badge" aria-hidden="true">{count}</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
