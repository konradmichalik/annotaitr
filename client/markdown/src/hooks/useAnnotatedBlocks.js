import { useEffect, useMemo } from 'react'

function typesByBlock(annotations, targetType) {
  const map = new Map()
  annotations.filter(a => a.targetType === targetType).forEach(a => { map.set(a.blockId, a.type) })
  return map
}

/**
 * Which rendered blocks carry an element-level annotation or a feedback note, so the
 * blocks can mark themselves. Pinpoint annotations are marked directly on the block DOM.
 */
export function useAnnotatedBlocks(annotations, containerRef) {
  const annotatedImages = useMemo(() => {
    const map = new Map()
    annotations.filter(a => a.targetType === 'image').forEach(a => { map.set(`${a.blockId}::${a.imageSrc}`, a.type) })
    return map
  }, [annotations])

  const annotatedDiagramBlocks = useMemo(() => typesByBlock(annotations, 'diagram'), [annotations])
  const annotatedMathBlocks = useMemo(() => typesByBlock(annotations, 'math'), [annotations])
  const annotatedPinpointBlocks = useMemo(() => typesByBlock(annotations, 'pinpoint'), [annotations])

  useEffect(() => {
    if (!containerRef.current) { return }
    const blockEls = containerRef.current.querySelectorAll('[data-block-id]')
    blockEls.forEach(el => {
      const blockId = el.dataset.blockId
      const type = annotatedPinpointBlocks.get(blockId)
      el.classList.toggle('pinpoint-annotated', !!type)
      el.classList.toggle('pinpoint-deletion', type === 'DELETION')
      el.classList.toggle('pinpoint-comment', type === 'COMMENT')
    })
  }, [annotatedPinpointBlocks, containerRef])

  const noteBlockIds = useMemo(() => {
    const map = new Map()
    annotations.filter(a => a.type === 'NOTES' && a.blockId).forEach(a => {
      if (!map.has(a.blockId)) { map.set(a.blockId, a.id) }
    })
    return map
  }, [annotations])

  return { annotatedImages, annotatedDiagramBlocks, annotatedMathBlocks, noteBlockIds }
}
