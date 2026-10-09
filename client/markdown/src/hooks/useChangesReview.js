import { useCallback, useState } from 'react'

const withPath = (set, path, present) => {
  if (set.has(path) === present) { return set }
  const next = new Set(set)
  if (present) { next.add(path) } else { next.delete(path) }
  return next
}

/**
 * Which changed files of a walkthrough are collapsed and which the reviewer has
 * marked as reviewed, keyed by path so a reload of the walkthrough keeps both.
 * Marking a file as reviewed collapses it, unmarking opens it again.
 */
export function useChangesReview() {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [reviewed, setReviewed] = useState(() => new Set())

  const toggle = useCallback((path) => setCollapsed((prev) => withPath(prev, path, !prev.has(path))), [])
  const expand = useCallback((path) => setCollapsed((prev) => withPath(prev, path, false)), [])
  const markReviewed = useCallback((path, value) => {
    setReviewed((prev) => withPath(prev, path, value))
    setCollapsed((prev) => withPath(prev, path, value))
  }, [])

  return { collapsed, reviewed, toggle, expand, markReviewed }
}
