// Painted values the marks take from CSS variables; an SVG drawn as an image sees no page styles.
const PAINT = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-weight', 'font-family']

/** A copy of `svg` with every element's computed paint written onto it. */
function standalone(svg, width, height) {
  const copy = svg.cloneNode(true)
  const sources = [svg, ...svg.querySelectorAll('*')]
  const targets = [copy, ...copy.querySelectorAll('*')]
  sources.forEach((source, index) => {
    const computed = getComputedStyle(source)
    targets[index].setAttribute('style', PAINT.map((name) => `${name}:${computed.getPropertyValue(name)}`).join(';'))
  })
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copy.setAttribute('width', width)
  copy.setAttribute('height', height)
  return new XMLSerializer().serializeToString(copy)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('the marks could not be drawn'))
    image.src = src
  })
}

/**
 * The annotated image as a PNG, drawn in the browser: `image` is the
 * picture as it was last shown (still loaded, so no server is needed) and
 * `svg` the marks over it, in the image's own pixels.
 */
export async function rasterize(image, svg) {
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (!width || !height) { throw new Error('the image is no longer loaded') }
  const url = URL.createObjectURL(new Blob([standalone(svg, width, height)], { type: 'image/svg+xml' }))
  try {
    const marks = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0, width, height)
    context.drawImage(marks, 0, 0, width, height)
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the image could not be encoded'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Hands `blob` to the browser as a download named `name`. */
export function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // Firefox can drop a download whose URL is revoked in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
