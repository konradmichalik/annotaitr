import { useCallback, useEffect, useRef } from 'react'
import { useModalDismiss } from '../../../shared/hooks/useModalDismiss.js'
import { threadTitle } from './threadView.js'

/** Shown instead of approving while the agent still waits for an answer, so a question is not approved away unseen. */
export default function ApprovalGate({ threads, round, onAnswer, onApproveAnyway }) {
  const dialogRef = useRef(null)
  const answerRef = useRef(null)

  // The latest handler lives in a ref so a re-render of the owner does not re-run the dismiss effect and move focus.
  const answerHandlerRef = useRef(onAnswer)
  answerHandlerRef.current = onAnswer
  const dismiss = useCallback(() => answerHandlerRef.current(), [])

  useModalDismiss(true, dismiss, dialogRef)
  useEffect(() => { answerRef.current?.focus() }, [])

  // The page behind is inert while aria-modal is set, so Tab cycles between the two buttons.
  const trapTab = (event) => {
    if (event.key !== 'Tab') { return }
    const buttons = dialogRef.current.querySelectorAll('button')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    const outside = !dialogRef.current.contains(document.activeElement) || document.activeElement === dialogRef.current
    if (event.shiftKey && (document.activeElement === first || outside)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || outside)) {
      event.preventDefault()
      first.focus()
    }
  }

  const count = threads.length

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-gate-title"
        onKeyDown={trapTab}
      >
        <div className="modal-header">
          <h2 id="approval-gate-title">
            The agent asked {count} {count === 1 ? 'question' : 'questions'} you have not answered
          </h2>
        </div>
        <div className="modal-body">
          <ul className="approval-gate-list">
            {threads.map((thread) => {
              const question = thread.replies.findLast((r) => !r.pending)
              return (
              <li key={thread.handle} className="approval-gate-item">
                <strong>{threadTitle(thread, round)}</strong>
                <p className="approval-gate-text">{thread.annotation.text}</p>
                {question && <p className="approval-gate-question">{question.text}</p>}
              </li>
              )
            })}
          </ul>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onApproveAnyway}>Approve anyway</button>
          <button ref={answerRef} type="button" className="btn btn-primary" onClick={onAnswer}>Answer</button>
        </div>
      </div>
    </div>
  )
}
