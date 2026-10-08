/**
 * The done page's countdown, from the Close tab after a decision setting:
 *
 * - idle:        no decision yet
 * - off:         the setting is Never, the tab stays open
 * - counting:    `remaining` of `total` seconds left
 * - kept:        the reviewer chose Keep open
 * - closing:     window.close() was called
 * - closeFailed: the browser kept the tab open (it was not opened by a script)
 */
export const IDLE = { phase: 'idle' }

export function startState(delay) {
  if (delay === '0') { return { phase: 'closing' } }
  const seconds = Number(delay)
  if (!Number.isInteger(seconds) || seconds <= 0) { return { phase: 'off' } }
  return { phase: 'counting', total: seconds, remaining: seconds }
}

export function countdownReducer(state, action) {
  if (action.type === 'start') { return state.phase === 'idle' ? startState(action.delay) : state }
  if (action.type === 'tick' && state.phase === 'counting') {
    return state.remaining <= 1 ? { phase: 'closing' } : { ...state, remaining: state.remaining - 1 }
  }
  if (action.type === 'keep' && state.phase === 'counting') { return { phase: 'kept' } }
  if (action.type === 'failed' && state.phase === 'closing') { return { phase: 'closeFailed' } }
  return state
}
