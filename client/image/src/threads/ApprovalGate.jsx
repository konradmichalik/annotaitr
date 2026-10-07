import { useEffect, useRef } from 'react'
import { useModalDismiss } from '../../../shared/hooks/useModalDismiss.js'
import { threadTitle } from './threadView.js'

/** Shown instead of approving while the agent still waits for an answer, so a question is not approved away unseen. */
export default function ApprovalGate({ threads, round, onAnswer, onApproveAnyway }) {
  const dialogRef = useRef(null)
  const answerRef = useRef(null)

  useModalDismiss(true, onAnswer, dialogRef)
  useEffect(() => { answerRef.current?.focus() }, [])

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
      >
        <div className="modal-header">
          <h2 id="approval-gate-title">
            The agent asked {count} {count === 1 ? 'question' : 'questions'} you have not answered
          </h2>
        </div>
        <div className="modal-body">
          <ul className="approval-gate-list">
            {threads.map((thread) => (
              <li key={thread.handle} className="approval-gate-item">
                <strong>{threadTitle(thread, round)}</strong>
                <p className="approval-gate-text">{thread.annotation.text}</p>
                <p className="approval-gate-question">{thread.replies.findLast((r) => !r.pending).text}</p>
              </li>
            ))}
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
