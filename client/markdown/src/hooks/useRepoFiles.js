import { useCallback, useRef, useState } from 'react'

const IDLE = { status: 'idle', files: [], truncated: false }

/**
 * The files of the whole repository. Every ask fetches them again, so a file
 * added or removed during a long review shows up. A list already shown stays
 * on screen meanwhile and when the fetch fails.
 */
export function useRepoFiles() {
  const [state, setState] = useState(IDLE)
  const fetching = useRef(false)

  const load = useCallback(async () => {
    if (fetching.current) { return }
    fetching.current = true
    setState((prev) => (prev.status === 'ready' ? prev : { ...IDLE, status: 'loading' }))
    try {
      const json = await (await fetch('/api/changes/files')).json()
      if (!json.success) { throw new Error('not available') }
      setState({ status: 'ready', files: json.data.files, truncated: json.data.truncated })
    } catch {
      setState((prev) => (prev.status === 'ready' ? prev : { ...IDLE, status: 'error' }))
    } finally {
      fetching.current = false
    }
  }, [])

  return { ...state, load }
}
