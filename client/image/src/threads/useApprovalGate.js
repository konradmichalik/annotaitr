import { useRef, useState } from 'react'
import { hasMark, openQuestions } from './threadView.js'

/**
 * The approval gate: Approve stops at the agent's unanswered questions instead of approving them away.
 * `approveRef` goes on the Approve button, it is where focus and a popover without a mark return to.
 */
export function useApprovalGate({ threads, submit, showThread, showEntryThread }) {
  const [gateOpen, setGateOpen] = useState(false)
  const approveRef = useRef(null)
  const unanswered = openQuestions(threads)

  const requestApproval = () => {
    if (unanswered.length > 0) { setGateOpen(true) } else { submit('approve') }
  }

  const answerQuestions = () => {
    setGateOpen(false)
    const button = approveRef.current
    const [thread] = unanswered
    // A thread without a mark has no canvas popover, so it hangs off the Approve button like a panel entry does.
    if (hasMark(thread)) {
      showThread(thread, button)
    } else {
      const rect = button.getBoundingClientRect()
      showEntryThread(thread, { x: rect.left + rect.width / 2, y: rect.bottom }, button)
    }
  }

  const approveAnyway = () => {
    setGateOpen(false)
    submit('approve')
  }

  return { gateOpen, unanswered, approveRef, requestApproval, answerQuestions, approveAnyway }
}
