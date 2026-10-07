import { threadTitle } from './threadView.js'

/** Shown in the decision dialog while an approval is selected and the agent still waits for an answer, so a question is not approved away unseen. */
export default function UnansweredQuestions({ threads, round, onAnswer }) {
  const count = threads.length
  return (
    <div className="decision-warning unanswered">
      <p className="unanswered-title">
        The agent asked {count} {count === 1 ? 'question' : 'questions'} you have not answered.
      </p>
      <ul className="unanswered-list">
        {threads.map((thread) => {
          const question = thread.replies.findLast((r) => !r.pending)
          return (
            <li key={thread.handle}>
              <strong>{threadTitle(thread, round)}</strong>
              <p className="unanswered-text">{thread.annotation.text}</p>
              {question && <p className="unanswered-question">{question.text}</p>}
            </li>
          )
        })}
      </ul>
      <button type="button" className="btn" onClick={onAnswer}>Answer</button>
    </div>
  )
}
