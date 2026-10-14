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
 *
 * `views` holds the Diff or Read view picked for a markdown file. A pick is
 * handed to `onPickView` to be stored as the default of the next walkthrough;
 * this one keeps the default it started with, so one pick never flips the others.
 */
export function useChangesReview({ defaultView = 'diff', onPickView } = {}) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [reviewed, setReviewed] = useState(() => new Set())
  const [views, setViews] = useState(() => new Map())
  const [startView] = useState(defaultView)

  const toggle = useCallback((path) => setCollapsed((prev) => withPath(prev, path, !prev.has(path))), [])
  const expand = useCallback((path) => setCollapsed((prev) => withPath(prev, path, false)), [])
  const markReviewed = useCallback((path, value) => {
    setReviewed((prev) => withPath(prev, path, value))
    setCollapsed((prev) => withPath(prev, path, value))
  }, [])
  // `remember` off sets the view without making it the default, as when a note card opens its Read view.
  const setView = useCallback((path, view, remember = true) => {
    setViews((prev) => (prev.get(path) === view ? prev : new Map(prev).set(path, view)))
    if (remember) { onPickView?.(view) }
  }, [onPickView])
  // Read is stored as the default only once its file has loaded, so a failed load never becomes the next start.
  const rememberView = useCallback((view) => onPickView?.(view), [onPickView])

  return { collapsed, reviewed, toggle, expand, markReviewed, views, defaultView: startView, setView, rememberView }
}
