import { useEffect, useRef } from 'react'

const THUMB_WIDTH = 112

/**
 * The pages of a PDF as a column of thumbnails, each with its number and
 * how many annotations it carries. Thumbnails load lazily, so a long
 * document only renders the ones scrolled into view.
 */
export default function PageStrip({ pages, current, counts, previousCounts, onSelect }) {
  const currentRef = useRef(null)

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' })
  }, [current])

  return (
    <nav className="page-strip" aria-label="Pages">
      <ol className="page-strip-list">
        {pages.map(({ number, width, height }) => {
          const count = counts.get(number) ?? 0
          const isCurrent = number === current
          const previous = previousCounts?.get(number) ?? 0
          const label = [
            `Page ${number}`,
            count > 0 && `${count} annotation${count === 1 ? '' : 's'}`,
            previous > 0 && `${previous} from last round`
          ].filter(Boolean).join(', ')
          return (
            <li key={number}>
              <button
                type="button"
                ref={isCurrent ? currentRef : null}
                className={`page-strip-item${isCurrent ? ' page-strip-item--current' : ''}`}
                aria-current={isCurrent ? 'page' : undefined}
                aria-label={label}
                title={label}
                onClick={() => onSelect(number)}
              >
                <img
                  className="page-strip-thumb"
                  src={`/api/pages/${number}/thumb`}
                  alt=""
                  loading="lazy"
                  width={THUMB_WIDTH}
                  height={Math.round((THUMB_WIDTH * height) / width)}
                  draggable={false}
                />
                <span className="page-strip-number" aria-hidden="true">{number}</span>
                {count > 0 && <span className="page-strip-badge" aria-hidden="true">{count}</span>}
                {previous > 0 && <span className="page-strip-previous" aria-hidden="true" />}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
