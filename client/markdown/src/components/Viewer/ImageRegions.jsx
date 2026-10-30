import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { toImageRegion, regionStyle } from '../../utils/imageRegion.js'

const pointIn = (rect, event) => ({ x: event.clientX - rect.left, y: event.clientY - rect.top })

// Escape, or a box too small to mean anything, cancels without starting a note.
export function ImageRegionDraw({ wrapper, onDone, onCancel }) {
  const [drag, setDrag] = useState(null)

  // Captured, so this Escape does not also close the search bar or a toolbar behind the layer.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') { return }
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onCancel])

  const image = wrapper.querySelector('img')

  const start = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const point = pointIn(image.getBoundingClientRect(), e)
    setDrag({ from: point, to: point })
  }

  const move = (e) => {
    if (drag) { setDrag({ ...drag, to: pointIn(image.getBoundingClientRect(), e) }) }
  }

  const end = (e) => {
    if (!drag) { return }
    const rect = image.getBoundingClientRect()
    const region = toImageRegion(
      drag.from,
      pointIn(rect, e),
      { width: rect.width, height: rect.height },
      { width: image.naturalWidth, height: image.naturalHeight }
    )
    setDrag(null)
    if (region) { onDone(region) } else { onCancel() }
  }

  const box = drag && {
    left: Math.min(drag.from.x, drag.to.x),
    top: Math.min(drag.from.y, drag.to.y),
    width: Math.abs(drag.to.x - drag.from.x),
    height: Math.abs(drag.to.y - drag.from.y)
  }

  return createPortal(
    <div
      className="image-region-draw"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => setDrag(null)}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="image-region-draw-hint" role="status">Drag over the image to mark a region. Esc cancels.</span>
      {box && <span className="image-region-draw-box" style={box} />}
    </div>,
    wrapper
  )
}

/**
 * The boxes of the notes that point at part of an image, drawn over it.
 * They are a mouse shortcut to the note, the panel reaches every note by keyboard.
 */
export function ImageRegionBoxes({ targets, onSelect }) {
  return targets.map(({ annotation, wrapper }) => createPortal(
    <span
      className="image-region-box"
      aria-hidden="true"
      style={regionStyle(annotation.imageRegion)}
      onClick={(e) => { e.stopPropagation(); onSelect(annotation, wrapper) }}
    />,
    wrapper,
    annotation.id
  ))
}
