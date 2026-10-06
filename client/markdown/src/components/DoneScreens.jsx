import { DoneScreen, DoneAutoClose } from '../../../shared/components/DoneScreen.jsx'
import { ORIGIN_LABELS } from '../utils/originLabels.js'

export function DisconnectedScreen({ reconnectState, annotationCount, onExport }) {
  return (
    <DoneScreen
      variant="disconnected"
      title="Server Disconnected"
      message="The server is no longer available. Your annotations have not been submitted."
    >
      {reconnectState === 'reconnecting' && (
        <p className="done-hint">Attempting to reconnect...</p>
      )}
      {reconnectState === 'failed' && (
        <p className="done-hint">Could not reconnect to the server.</p>
      )}
      {annotationCount > 0 && (
        <div className="done-actions">
          <p className="done-backup-info">
            {annotationCount} annotation{annotationCount !== 1 ? 's' : ''} in this file not yet submitted.
          </p>
          <button onClick={onExport} className="btn btn-feedback">
            Export Annotations
          </button>
        </div>
      )}
    </DoneScreen>
  )
}

export function SubmittedScreen({ decision, approvedNoteCount, totalAnnotationCount, origin, autoCloseState, onEnableAutoClose }) {
  return (
    <DoneScreen
      variant={decision}
      title={decision === 'approved'
        ? (approvedNoteCount > 0 ? 'Approved with Notes' : 'Approved')
        : 'Feedback Submitted'}
      message={decision === 'approved'
        ? (approvedNoteCount > 0
          ? `Approved as-is. ${approvedNoteCount} annotation${approvedNoteCount !== 1 ? 's' : ''} passed along as notes.`
          : 'No changes requested. The file was approved as-is.')
        : `${totalAnnotationCount} annotation${totalAnnotationCount !== 1 ? 's' : ''} ${ORIGIN_LABELS[origin] ? `sent to ${ORIGIN_LABELS[origin]}` : 'submitted'}.`}
    >
      {decision === 'feedback' && ORIGIN_LABELS[origin]
        ? <p className="done-hint">{ORIGIN_LABELS[origin]} is processing your feedback. A new browser tab will open with the next iteration.</p>
        : <p className="done-hint">You can close this tab.</p>}
      <DoneAutoClose state={autoCloseState} onEnable={onEnableAutoClose} />
    </DoneScreen>
  )
}
