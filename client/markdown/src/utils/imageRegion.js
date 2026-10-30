const MIN_SHOWN_PX = 4

const clamp = (value, max) => Math.min(Math.max(value, 0), max)

/**
 * A box dragged over an image shown at `shown` size, in the pixels of the
 * image itself. Points are relative to the shown image. A click or a box
 * under MIN_SHOWN_PX on a side is no region.
 */
export function toImageRegion(from, to, shown, natural) {
  if (!(shown.width > 0 && shown.height > 0 && natural.width > 0 && natural.height > 0)) { return null }
  const left = clamp(Math.min(from.x, to.x), shown.width)
  const right = clamp(Math.max(from.x, to.x), shown.width)
  const top = clamp(Math.min(from.y, to.y), shown.height)
  const bottom = clamp(Math.max(from.y, to.y), shown.height)
  if (right - left < MIN_SHOWN_PX || bottom - top < MIN_SHOWN_PX) { return null }
  const scaleX = natural.width / shown.width
  const scaleY = natural.height / shown.height
  return {
    x: Math.round(left * scaleX),
    y: Math.round(top * scaleY),
    width: Math.round((right - left) * scaleX),
    height: Math.round((bottom - top) * scaleY),
    imageWidth: natural.width,
    imageHeight: natural.height
  }
}

/** Percent placement of a region over its image, so the box follows the image when it scales. */
export const regionStyle = ({ x, y, width, height, imageWidth, imageHeight }) => ({
  left: `${(x / imageWidth) * 100}%`,
  top: `${(y / imageHeight) * 100}%`,
  width: `${(width / imageWidth) * 100}%`,
  height: `${(height / imageHeight) * 100}%`
})
