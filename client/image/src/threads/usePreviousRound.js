import { useEffect, useState } from 'react'
import { readPreviousRound, threadsQuery } from './threadView.js'

const NONE = { round: null, threads: [] }

/** Last round's threads. Any failure leaves it empty, a missing previous round must never disturb the review. */
export function usePreviousRound({ ready, duration }) {
  const [loaded, setLoaded] = useState(NONE)

  useEffect(() => {
    if (!ready) { return }
    let wanted = true
    fetch(`/api/threads${threadsQuery(duration)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (wanted) { setLoaded(readPreviousRound(body)) } })
      .catch(() => {})
    return () => { wanted = false }
  }, [ready, duration])

  return loaded
}
