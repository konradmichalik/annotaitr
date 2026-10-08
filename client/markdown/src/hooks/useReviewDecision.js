import { useCallback, useState } from 'react'
import { applySummary } from '../../../shared/utils/decision.js'
import { createAnnotationId } from '../../../shared/utils/annotationId.js'

export const isGeneralComment = (a) => a.targetType === 'global' && a.type !== 'NOTES'

export function createGeneralComment(text) {
  return {
    id: createAnnotationId(),
    blockId: '',
    startOffset: 0,
    endOffset: 0,
    type: 'COMMENT',
    targetType: 'global',
    text,
    originalText: '',
    createdAt: Date.now(),
    startMeta: null,
    endMeta: null
  }
}

// Agent notes from --feedback-notes are read-only context and never part of a decision.
const ownNotes = (annotations) => annotations.filter((a) => a.type !== 'NOTES')

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) { throw new Error(`Server responded with ${response.status}`) }
}

/**
 * Submits the reviewer's decision. `finish({ choice, summary })` takes the
 * decision dialog's result: the summary becomes the active file's general
 * comment, `approve` discards the notes, `approve-notes` passes them along.
 * A `summary` of null leaves the notes as they are (the split button's main action).
 */
export function useReviewDecision({ files, activeFileIndex, annDispatch, setErrorStatus }) {
  const [decision, setDecision] = useState(null) // 'approved' | 'feedback'
  const [approvedNoteCount, setApprovedNoteCount] = useState(0)

  const finish = useCallback(async ({ choice, summary = null }) => {
    const activeAnnotations = files[activeFileIndex]?.annState.annotations ?? []
    const withSummary = summary === null
      ? activeAnnotations
      : applySummary(activeAnnotations, summary, { isGeneral: isGeneralComment, create: createGeneralComment })
    if (withSummary !== activeAnnotations) { annDispatch({ type: 'RESTORE', annotations: withSummary }) }

    const reviewed = files.map((f, index) => ({
      path: f.path,
      annotations: ownNotes(index === activeFileIndex ? withSummary : f.annState.annotations),
      blocks: f.blocks
    }))
    const noteCount = reviewed.reduce((sum, f) => sum + f.annotations.length, 0)

    try {
      if (choice === 'feedback') {
        await post('/api/feedback', { files: reviewed })
        setDecision('feedback')
        return
      }
      const keepNotes = choice === 'approve-notes' && noteCount > 0
      await post('/api/approve', keepNotes ? { files: reviewed } : {})
      setApprovedNoteCount(keepNotes ? noteCount : 0)
      setDecision('approved')
    } catch (err) {
      setErrorStatus(`${choice === 'feedback' ? 'Submit' : 'Approve'} failed: ${err.message}`)
    }
  }, [files, activeFileIndex, annDispatch, setErrorStatus])

  return { decision, submitted: decision !== null, approvedNoteCount, finish }
}
