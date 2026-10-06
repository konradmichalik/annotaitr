import { createAnnotationId } from '../../../shared/utils/annotationId.js'

export function createInsertionAnnotation({ blockId, offset, afterContext }, text) {
  return {
    id: createAnnotationId(),
    blockId,
    startOffset: offset,
    endOffset: offset,
    type: 'INSERTION',
    text,
    afterContext,
    originalText: '',
    createdAt: Date.now(),
    startMeta: null,
    endMeta: null
  }
}

export function createTokenAnnotation(tokenData, type, text, label) {
  return {
    id: createAnnotationId(),
    blockId: tokenData.blockId,
    startOffset: tokenData.charStart,
    endOffset: tokenData.charEnd,
    type,
    targetType: 'token',
    text: text || null,
    originalText: tokenData.tokenText,
    createdAt: Date.now(),
    startMeta: null,
    endMeta: null,
    label: label || null
  }
}

export function createElementAnnotation(elementData, type, text, label) {
  return {
    id: createAnnotationId(),
    blockId: elementData.blockId,
    startOffset: 0,
    endOffset: 0,
    type,
    targetType: elementData.targetType,
    text: text || null,
    originalText: elementData.originalText,
    createdAt: Date.now(),
    startMeta: null,
    endMeta: null,
    imageAlt: elementData.imageAlt,
    imageSrc: elementData.imageSrc,
    label: label || null
  }
}

/** Human-readable name for a block, shown on the pinpoint overlay. */
export function getBlockLabel(block) {
  if (!block) { return 'Block' }
  if (block.type === 'heading') { return `Heading ${block.level}` }
  if (block.type === 'code') { return `Code${block.language ? ` (${block.language})` : ''}` }
  if (block.type === 'list-item') { return 'List item' }
  if (block.type === 'blockquote') { return 'Blockquote' }
  if (block.type === 'frontmatter') { return 'Frontmatter' }
  if (block.type === 'hr') { return 'Divider' }
  if (block.type === 'math') { return 'Formula' }
  return 'Paragraph'
}
