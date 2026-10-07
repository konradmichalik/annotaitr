import { useCallback, useEffect, useRef, useState } from 'react'
import { readPreviousRound, threadsQuery } from './threadView.js'

const NONE = { round: null, threads: [] }

/**
 * Last round's threads, and `reload()` to ask again while keeping what is shown until the answer arrives.
 * Any failure of the first load leaves it empty, a missing previous round must never disturb the review. A failed reload keeps what is shown.
 * `captureKey` changes with every capture: the server anchors against the current image size, so a URL
 * captured again at another viewport has to be asked again.
 */
export function usePreviousRound({ ready, duration, captureKey }) {
  const [loaded, setLoaded] = useState(NONE)
  const [reloads, setReloads] = useState(0)
  const seenReloads = useRef(0)
  const reload = useCallback(() => setReloads((n) => n + 1), [])

  useEffect(() => {
    if (!ready) { return }
    let wanted = true
    const isReload = reloads !== seenReloads.current
    seenReloads.current = reloads
    const fail = () => { if (wanted) { setLoaded((current) => (isReload ? current : NONE)) } }
    fetch(`/api/threads${threadsQuery(duration)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!wanted) { return }
        const next = readPreviousRound(body)
        if (next.round === null && next.threads.length === 0 && isReload) { return }
        setLoaded(next)
      })
      .catch(fail)
    return () => { wanted = false }
  }, [ready, duration, captureKey, reloads])

  return { ...loaded, reload }
}
