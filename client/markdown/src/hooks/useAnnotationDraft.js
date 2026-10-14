import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { readDraft, writeDraft, clearDraft } from '../utils/draftStorage.js'

const DEBOUNCE_MS = 500

function formatTimeAgo(ts) {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) {return 'just now'}
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`}
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {return `${hours} hour${hours !== 1 ? 's' : ''} ago`}
  const days = Math.floor(hours / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

// Reaching localStorage itself throws when site data is blocked.
function withStorage(action) {
  try { return action(localStorage) } catch { return null }
}

// A draft from before an edit sits under the old hash too, which nothing reads once the file id copy is handled.
function forgetEarlierVersion(data) {
  if (data?.fileChanged && data.contentHash) {
    withStorage((storage) => clearDraft(storage, { contentHash: data.contentHash }))
  }
}

export function useAnnotationDraft({ annotations, contentHash, fileId, submitted, enabled = true }) {
  const [draftBanner, setDraftBanner] = useState(null)
  const draftDataRef = useRef(null)
  const timerRef = useRef(null)
  const hasMountedRef = useRef(false)
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations

  const file = useMemo(() => ({ contentHash, fileId }), [contentHash, fileId])
  const hasFile = Boolean(contentHash || fileId)

  // Load draft on mount / tab switch
  useEffect(() => {
    if (!hasFile) {return}

    // If annotations are already in memory (tab switch), the draft is redundant
    const hasAnnotationsInState = annotationsRef.current.filter(a => a.type !== 'NOTES').length > 0
    const data = hasAnnotationsInState ? null : withStorage((storage) => readDraft(storage, file))
    draftDataRef.current = data
    setDraftBanner(data ? { count: data.annotations.length, timeAgo: formatTimeAgo(data.ts) } : null)
    hasMountedRef.current = true
  }, [file, hasFile])

  // Debounced auto-save on annotation changes (exclude AI Notes)
  useEffect(() => {
    if (!hasFile || submitted || !hasMountedRef.current || !enabled) {return}
    const userAnnotations = annotations.filter(a => a.type !== 'NOTES')
    if (userAnnotations.length === 0) {
      // Clear draft when all user annotations removed, but not one still waiting in the banner
      if (!draftDataRef.current) { withStorage((storage) => clearDraft(storage, file)) }
      return
    }

    if (timerRef.current) {clearTimeout(timerRef.current)}

    timerRef.current = setTimeout(() => {
      withStorage((storage) => writeDraft(storage, file, userAnnotations, Date.now()))
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) {clearTimeout(timerRef.current)}
    }
  }, [annotations, file, hasFile, submitted, enabled])

  // Clear draft on submit
  useEffect(() => {
    if (submitted && hasFile) {
      forgetEarlierVersion(draftDataRef.current)
      withStorage((storage) => clearDraft(storage, file))
    }
  }, [submitted, file, hasFile])

  /** The draft's notes and whether the file changed since they were saved. */
  const restoreDraft = useCallback(() => {
    const data = draftDataRef.current
    setDraftBanner(null)
    draftDataRef.current = null
    forgetEarlierVersion(data)
    return { annotations: data?.annotations || [], fileChanged: Boolean(data?.fileChanged) }
  }, [])

  const dismissDraft = useCallback(() => {
    forgetEarlierVersion(draftDataRef.current)
    setDraftBanner(null)
    draftDataRef.current = null
    if (hasFile) {
      withStorage((storage) => clearDraft(storage, file))
    }
  }, [file, hasFile])

  return { draftBanner, restoreDraft, dismissDraft }
}
