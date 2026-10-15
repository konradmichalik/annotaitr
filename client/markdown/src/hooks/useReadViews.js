import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFullDiffs } from './useFullDiffs.js'
import { canRead, fileView, isOldBlock, nextView, readPathOf, readViewsOf } from '../utils/fileVersions.js'
import { isDiffBlock } from '../utils/changeSections.js'

const NO_FILES = []

const without = (set, path) => new Set([...set].filter((p) => p !== path))

/** Which cards show Whole file, over the shared cache of whole-file diffs. */
function useWholeFiles({ entries, load }) {
  const [whole, setWhole] = useState(() => new Set())
  const toggleWhole = useCallback((path) => {
    if (entries.get(path)?.loading) { return }
    if (whole.has(path)) {
      setWhole(without(whole, path))
    } else {
      setWhole(new Set(whole).add(path))
      load(path)
    }
  }, [whole, entries, load])
  const closeWhole = useCallback((path) => setWhole((prev) => (prev.has(path) ? without(prev, path) : prev)), [])
  return { whole, toggleWhole, closeWhole }
}

/** Parsed Read and Changes views by path; a file whose diff did not change keeps its blocks. */
function useParsedViews(files, entries) {
  const last = useRef(new Map())
  const views = useMemo(() => readViewsOf(files, entries, last.current), [files, entries])
  useEffect(() => { last.current = views }, [views])
  return useMemo(() => ({
    changesByPath: new Map([...views].map(([path, view]) => [path, view.entries])),
    blocks: [...views.values()].flatMap((view) => [...view.blocks, ...view.oldBlocks])
  }), [views])
}

const fileOfBlock = (files, blockId) => files.find((f) =>
  f.path === readPathOf(blockId) || f.heading.id === blockId || f.focusBlock?.id === blockId || f.blocks.some((b) => b.id === blockId))

/**
 * The view a note needs to be seen: Changes for one on the old file, Read for
 * one on the new file unless Changes already shows it, Diff for one on the
 * hunks, else none.
 */
function viewFor(file, blockId, shown) {
  if (isOldBlock(blockId)) { return 'changes' }
  if (readPathOf(blockId)) { return shown === 'changes' ? 'changes' : 'read' }
  return file.blocks.some((b) => b.id === blockId && isDiffBlock(b)) ? 'diff' : null
}

/**
 * The Diff, Read and Changes views of a walkthrough's markdown files, and
 * Whole file. Read and Changes are one rendering that stays mounted once its
 * file has loaded, hidden while Diff is shown, so the highlights in it and in
 * the cards below keep their place. A file that cannot be loaded shows its
 * diff and says why in `statusOf`.
 */
export function useReadViews({ sections, review }) {
  const full = useFullDiffs()
  const { entries, load } = full
  const { views, defaultView, setView, rememberView, collapsed, expand } = review
  const files = sections?.files ?? NO_FILES
  const { whole, toggleWhole, closeWhole } = useWholeFiles(full)
  const { changesByPath, blocks } = useParsedViews(files, entries)

  const picked = useCallback((file) => fileView(views, file, defaultView), [views, defaultView])
  const viewOf = useCallback((file) => (picked(file) !== 'diff' && entries.get(file.path)?.error ? 'diff' : picked(file)), [picked, entries])
  const statusOf = useCallback((file) => {
    if (picked(file) === 'diff' || changesByPath.has(file.path)) { return null }
    const error = entries.get(file.path)?.error
    return error ? `${error} The diff stays.` : 'Loading the file to read…'
  }, [picked, changesByPath, entries])

  // A file that opens in Read or Changes by default loads without being asked.
  useEffect(() => {
    files.filter((file) => picked(file) !== 'diff').forEach((file) => load(file.path))
  }, [files, picked, load])

  const pick = useCallback((path, view, remember = true) => {
    setView(path, view, remember && view === 'diff')
    if (view === 'diff') { return }
    load(path).then((entry) => { if (remember && typeof entry.diff === 'string') { rememberView(view) } })
  }, [setView, rememberView, load])

  const cycle = useCallback((path) => {
    const file = files.find((f) => f.path === path)
    if (!canRead(file)) { return false }
    pick(path, nextView(viewOf(file)))
    return true
  }, [files, viewOf, pick])

  /** Shows the place a note sits in: its card opened, on the view that holds it. True when anything had to change. */
  const reveal = useCallback((ann) => {
    const file = fileOfBlock(files, ann?.blockId)
    if (!file) { return false }
    const wanted = viewFor(file, ann.blockId, viewOf(file))
    const switchView = wanted !== null && canRead(file) && viewOf(file) !== wanted
    const leaveWhole = wanted === 'diff' && whole.has(file.path)
    const open = collapsed.has(file.path)
    if (switchView) { pick(file.path, wanted, false) }
    if (leaveWhole) { closeWhole(file.path) }
    if (open) { expand(file.path) }
    return switchView || leaveWhole || open
  }, [files, viewOf, whole, collapsed, expand, pick, closeWhole])

  /** Loads the Read views the notes sit in; true once each has loaded or failed. */
  const settle = useCallback((annotations) => {
    const paths = [...new Set(annotations.map((ann) => readPathOf(ann.blockId)).filter(Boolean))]
    // A failed load is not asked again here, so waiting on it can end.
    paths.filter((path) => !entries.has(path)).forEach((path) => load(path))
    return paths.every((path) => entries.has(path) && !entries.get(path).loading)
  }, [load, entries])

  return { full, viewOf, statusOf, changesByPath, blocks, pick, cycle, reveal, settle, whole, toggleWhole }
}
