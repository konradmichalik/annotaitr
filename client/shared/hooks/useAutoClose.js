import { useEffect, useReducer, useCallback } from 'react'
import { IDLE, countdownReducer } from '../utils/autoClose.js'

// window.close() is ignored for a tab no script opened; whether it worked shows only a moment later.
const CLOSE_CHECK_MS = 300

/** Runs the countdown once `active` turns true. `keepOpen` stops it. */
export function useAutoClose(active, delay = 'off') {
  const [state, dispatch] = useReducer(countdownReducer, IDLE)

  useEffect(() => {
    if (active) { dispatch({ type: 'start', delay }) }
  }, [active, delay])

  useEffect(() => {
    if (state.phase === 'counting') {
      const timer = setTimeout(() => dispatch({ type: 'tick' }), 1000)
      return () => clearTimeout(timer)
    }
    if (state.phase === 'closing') {
      window.close()
      const timer = setTimeout(() => { if (!window.closed) { dispatch({ type: 'failed' }) } }, CLOSE_CHECK_MS)
      return () => clearTimeout(timer)
    }
  }, [state])

  const keepOpen = useCallback(() => dispatch({ type: 'keep' }), [])
  return { state, keepOpen }
}
