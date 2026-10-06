/**
 * Derive a human-readable, coarse position description for an annotation, so
 * the feedback stays actionable even if the agent never opens the image.
 */

export function boundingPoint(annotation) {
  const { type, geometry } = annotation
  // A general comment about the whole image has no geometry and no real
  // position - placed far off any real annotation so it never registers as
  // "nearby" one in findNearbyAnnotationNumbers.
  if (type === 'comment') {
    return { x: -1e6, y: -1e6 }
  }
  if (type === 'pin') {
    return { x: geometry.x, y: geometry.y }
  }
  // A text selection's geometry is the box around all of its lines.
  if (type === 'box' || type === 'element' || type === 'text') {
    return { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 }
  }
  if (type === 'arrow') {
    return { x: (geometry.x1 + geometry.x2) / 2, y: (geometry.y1 + geometry.y2) / 2 }
  }
  const points = geometry.points
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}

function horizontalBucket(pctFromLeft) {
  if (pctFromLeft < 33) { return 'left' }
  if (pctFromLeft > 66) { return 'right' }
  return 'center'
}

function verticalBucket(pctFromTop) {
  if (pctFromTop < 33) { return 'top' }
  if (pctFromTop > 66) { return 'bottom' }
  return 'middle'
}

function positionLabel(vertical, horizontal) {
  const parts = []
  if (vertical !== 'middle') { parts.push(vertical) }
  if (horizontal !== 'center') { parts.push(horizontal) }
  return parts.length > 0 ? parts.join(' ') : 'center'
}

export function describePosition(annotation, imageWidth, imageHeight) {
  if (annotation.type === 'comment') { return 'the whole image' }
  const { x, y } = boundingPoint(annotation)
  const pctFromLeft = Math.round((x / imageWidth) * 100)
  const pctFromTop = Math.round((y / imageHeight) * 100)
  const label = positionLabel(verticalBucket(pctFromTop), horizontalBucket(pctFromLeft))
  return `${label} (~${pctFromTop}% from top, ~${pctFromLeft}% from left)`
}

// How close two annotations' positions need to be, as a percentage of the
// image diagonal, before a coarse text description alone risks being
// ambiguous between them (e.g. two boxes both landing in "top right").
const NEARBY_THRESHOLD_PCT = 12

/**
 * For each annotation, the 1-based numbers of other annotations positioned
 * close enough that the coarse label might not tell them apart, so the
 * feedback text can call that out instead of relying on the image alone.
 */
export function findNearbyAnnotationNumbers(annotations, imageWidth, imageHeight) {
  const diagonal = Math.hypot(imageWidth, imageHeight)
  const points = annotations.map(boundingPoint)

  return points.map((point, index) => {
    const nearby = []
    points.forEach((other, otherIndex) => {
      if (otherIndex === index) { return }
      const distancePct = (Math.hypot(point.x - other.x, point.y - other.y) / diagonal) * 100
      if (distancePct <= NEARBY_THRESHOLD_PCT) { nearby.push(otherIndex + 1) }
    })
    return nearby
  })
}
