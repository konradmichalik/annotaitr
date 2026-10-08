import { primaryAction } from '../utils/decision.js'
import { CheckIcon, ChevronDownIcon } from './HeaderIcons.jsx'

/**
 * The one exit of a review. The main part follows the state (Approve with
 * nothing to send, Send feedback with a count otherwise), the chevron opens
 * the decision dialog with every option.
 */
export function DecisionButton({ itemCount, title, busy = false, dialogOpen = false, primaryRef, onPrimary, onOpenDialog }) {
  const action = primaryAction(itemCount)
  return (
    <div className="split-button">
      <button
        ref={primaryRef}
        type="button"
        className="btn btn-primary split-button-main"
        onClick={() => onPrimary(action.choice)}
        disabled={busy}
        title={title}
      >
        {action.choice === 'approve' && <CheckIcon />}
        {action.label}
        {action.count > 0 && <span className="btn-badge">{action.count}</span>}
      </button>
      <button
        type="button"
        className="btn btn-primary split-button-menu"
        onClick={onOpenDialog}
        disabled={busy}
        aria-label="Other decisions"
        aria-haspopup="dialog"
        aria-expanded={dialogOpen}
        title="Other decisions"
      >
        <ChevronDownIcon />
      </button>
    </div>
  )
}
