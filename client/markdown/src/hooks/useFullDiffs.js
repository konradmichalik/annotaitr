import { useCallback, useRef, useState } from 'react'

const LOADING = { loading: true, diff: null, error: null }

/**
 * The diffs of changed files with the whole file as context, by path, loaded
 * the first time Whole file or the Read view asks for one and kept for both.
 * An entry is `{ loading, diff, error }`; `forget` drops a failed load so the
 * next request asks again.
 */
export function useFullDiffs() {
  const [entries, setEntries] = useState(() => new Map())
  // The ref leads, so a second request in the same tick already sees the first one loading.
  const entriesRef = useRef(entries)

  const setEntry = useCallback((path, entry) => {
    const next = new Map(entriesRef.current)
    if (entry) { next.set(path, entry) } else { next.delete(path) }
    entriesRef.current = next
    setEntries(next)
  }, [])

  const load = useCallback(async (path) => {
    const known = entriesRef.current.get(path)
    if (known && !known.error) { return }
    setEntry(path, LOADING)
    try {
      const json = await (await fetch(`/api/changes/full?path=${encodeURIComponent(path)}`)).json()
      setEntry(path, json.success
        ? { loading: false, diff: json.data.diff, error: null }
        : { loading: false, diff: null, error: 'The whole file is not available.' })
    } catch {
      setEntry(path, { loading: false, diff: null, error: 'Could not load the whole file.' })
    }
  }, [setEntry])

  const forget = useCallback((path) => {
    if (entriesRef.current.get(path)?.error) { setEntry(path, null) }
  }, [setEntry])

  return { entries, load, forget }
}
