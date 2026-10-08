import { createAnnotationId } from '../../../shared/utils/annotationId.js'

// The general comment has no shape, page or time: it is about the whole target.
export const isGeneralComment = (a) => a.type === 'comment' && !a.geometry && typeof a.page !== 'number' && typeof a.time !== 'number'

export function createGeneralComment(text) {
  return { id: createAnnotationId(), createdAt: Date.now(), type: 'comment', geometry: null, text, color: null }
}
