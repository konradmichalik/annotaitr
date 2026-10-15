import { useCallback, useRef, useState } from 'react'

const LOADING = { loading: true, diff: null, error: null }
// Each load runs `git diff` over the whole file, so a walkthrough that opens on Read asks a few at a time.
const MAX_LOADS = 3

async function fetchFullDiff(path) {
  try {
    const json = await (await fetch(`/api/changes/full?path=${encodeURIComponent(path)}`)).json()
    return json.success
      ? { loading: false, diff: json.data.diff, error: null }
      : { loading: false, diff: null, error: 'The whole file is not available.' }
  } catch {
    return { loading: false, diff: null, error: 'Could not load the whole file.' }
  }
}

/** Runs at most `limit` tasks at once, the others wait in order. */
function useLimiter(limit) {
  const slots = useRef({ active: 0, waiting: [] })
  return useCallback(async (task) => {
    const state = slots.current
    if (state.active >= limit) {
      await new Promise((resolve) => { state.waiting = [...state.waiting, resolve] })
    } else {
      state.active += 1
    }
    try {
      return await task()
    } finally {
      const [next, ...rest] = state.waiting
      state.waiting = rest
      if (next) { next() } else { state.active -= 1 }
    }
  }, [limit])
}

/**
 * The diffs of changed files with the whole file as context, by path, loaded
 * the first time Whole file or the Read view asks for one and kept for both.
 * An entry is `{ loading, diff, error }`. `load` resolves to the entry; a failed
 * load is kept until the next `load` of that path asks again.
 */
export function useFullDiffs() {
  const [entries, setEntries] = useState(() => new Map())
  // The refs lead, so a second request in the same tick already sees the first one loading.
  const entriesRef = useRef(entries)
  const pending = useRef(new Map())
  const limit = useLimiter(MAX_LOADS)

  const setEntry = useCallback((path, entry) => {
    entriesRef.current = new Map(entriesRef.current).set(path, entry)
    setEntries(entriesRef.current)
  }, [])

  const load = useCallback((path) => {
    const known = entriesRef.current.get(path)
    if (pending.current.has(path)) { return pending.current.get(path) }
    if (known && !known.loading && !known.error) { return Promise.resolve(known) }
    setEntry(path, LOADING)
    const request = limit(() => fetchFullDiff(path)).then((entry) => {
      pending.current.delete(path)
      setEntry(path, entry)
      return entry
    })
    pending.current.set(path, request)
    return request
  }, [setEntry, limit])

  return { entries, load }
}
