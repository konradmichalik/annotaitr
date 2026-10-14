import { useCallback, useEffect, useMemo } from 'react'
import { useFullDiffs } from './useFullDiffs.js'
import { canRead, fileView, readPathOf, readViewsOf } from '../utils/fileVersions.js'

const NO_FILES = []

/**
 * The Diff and Read views of a walkthrough's markdown files. A Read view
 * stays mounted once its file has loaded, hidden while Diff is shown, so the
 * highlights in it and in the cards below keep their place.
 */
export function useReadViews({ sections, review }) {
  const full = useFullDiffs()
  const { load } = full
  const { views, defaultView, setView, collapsed, expand } = review
  const files = sections?.files ?? NO_FILES

  const viewOf = useCallback((file) => fileView(views, file, defaultView), [views, defaultView])
  const byPath = useMemo(() => readViewsOf(files, full.entries), [files, full.entries])
  const blocks = useMemo(() => [...byPath.values()].flat(), [byPath])

  // A file that opens in Read by default loads without being asked.
  useEffect(() => {
    files.filter((file) => viewOf(file) === 'read').forEach((file) => load(file.path))
  }, [files, viewOf, load])

  const pick = useCallback((path, view, remember = true) => {
    setView(path, view, remember)
    if (view === 'read') { load(path) }
  }, [setView, load])

  const cycle = useCallback((path) => {
    const file = files.find((f) => f.path === path)
    if (!canRead(file)) { return false }
    pick(path, viewOf(file) === 'read' ? 'diff' : 'read')
    return true
  }, [files, viewOf, pick])

  /** Shows the Read view a note sits in, opening its card. True when anything had to change. */
  const reveal = useCallback((ann) => {
    const file = files.find((f) => f.path === readPathOf(ann?.blockId))
    if (!file) { return false }
    const hidden = viewOf(file) !== 'read' || collapsed.has(file.path)
    if (viewOf(file) !== 'read') { pick(file.path, 'read', false) }
    if (collapsed.has(file.path)) { expand(file.path) }
    return hidden
  }, [files, viewOf, collapsed, expand, pick])

  /** Loads the Read views the notes sit in; true once each has loaded or failed. */
  const settle = useCallback((annotations) => {
    const paths = [...new Set(annotations.map((ann) => readPathOf(ann.blockId)).filter(Boolean))]
    // A failed load is not asked again here, so waiting on it can end.
    paths.filter((path) => !full.entries.has(path)).forEach((path) => load(path))
    return paths.every((path) => full.entries.has(path) && !full.entries.get(path).loading)
  }, [load, full.entries])

  return { full, viewOf, byPath, blocks, pick, cycle, reveal, settle }
}
