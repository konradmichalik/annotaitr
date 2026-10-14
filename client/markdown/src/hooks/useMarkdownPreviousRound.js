import { useCallback, useEffect, useState } from 'react'
import { readPreviousRound, pendingReplyCount, openQuestions } from '../../../shared/threads/threadView.js'

const NONE = { round: null, threads: [] }

/**
 * Last round's threads once the files are loaded, and `reload()` after a
 * reply was added or removed. A failed load leaves the round empty: a missing
 * session must never disturb the review. A failed reload keeps what is shown.
 */
export function useMarkdownPreviousRound(ready) {
  const [loaded, setLoaded] = useState(NONE)
  const [reloads, setReloads] = useState(0)
  const reload = useCallback(() => setReloads((n) => n + 1), [])

  useEffect(() => {
    if (!ready) { return }
    let wanted = true
    fetch('/api/threads')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const next = readPreviousRound(body)
        if (wanted && (next.round !== null || reloads === 0)) { setLoaded(next) }
      })
      .catch(() => {})
    return () => { wanted = false }
  }, [ready, reloads])

  return {
    ...loaded,
    reload,
    replyCount: pendingReplyCount(loaded.threads),
    unanswered: openQuestions(loaded.threads)
  }
}
