import { useCallback, useEffect, useRef, useState } from 'react'
import { useModalDismiss } from '../hooks/useModalDismiss.js'
import { trapTab } from '../utils/focusTrap.js'
import { decisionLegend } from '../utils/origin.js'
import {
  decisionOptions, defaultChoice, describeBreakdown, needsDiscardConfirm, plural, submitLabel
} from '../utils/decision.js'
import { MOD } from './SettingsModal.jsx'

const isSubmitKey = (event) => event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.nativeEvent?.isComposing

/**
 * Finish review: Send feedback, Approve with notes or Approve, plus an optional
 * summary that becomes the general comment. `noteTypes` lists the type of every
 * note except the general comment, which `generalText` carries (null when there
 * is none). `approvalWarning` is shown while an approval is selected.
 */
export function DecisionDialog({
  origin, noteTypes, nouns, generalType, generalText = null, replies = 0, info = null,
  initialChoice = null, approvalWarning = null, busy = false, onSubmit, onClose
}) {
  const dialogRef = useRef(null)
  const [summary, setSummary] = useState(generalText ?? '')
  const hasSummary = summary.trim() !== ''
  const types = hasSummary ? [...noteTypes, generalType] : noteTypes
  const counts = { notes: types.length, replies, breakdown: describeBreakdown(types, nouns) }
  const options = decisionOptions(counts)
  const [picked, setPicked] = useState(() => initialChoice ?? defaultChoice(counts))
  // Clearing the summary can take away the only note, and with it the choices that need one.
  const choice = options.find((o) => o.value === picked)?.disabled ? 'approve' : picked
  const [confirming, setConfirming] = useState(false)

  // A ref keeps the dismiss effect from re-running, and moving focus, on every render of the owner.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const close = useCallback(() => closeRef.current(), [])
  useModalDismiss(true, close, dialogRef)
  useEffect(() => { dialogRef.current?.querySelector('input[type="radio"]:checked')?.focus() }, [])

  const pick = (value) => {
    setPicked(value)
    setConfirming(false)
  }

  const submit = () => {
    if (busy) { return }
    if (needsDiscardConfirm(choice, counts.notes) && !confirming) {
      setConfirming(true)
      return
    }
    onSubmit({ choice, summary })
  }

  const handleKeyDown = (event) => {
    trapTab(event, dialogRef.current)
    if (isSubmitKey(event)) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="decision-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { close() } }}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="decision-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-title"
        onKeyDown={handleKeyDown}
      >
        <h2 id="decision-title" className="decision-title">Finish review</h2>
        <form onSubmit={(event) => { event.preventDefault(); submit() }}>
          <fieldset className="decision-options">
            <legend className="decision-legend">{decisionLegend(origin)}</legend>
            {options.map((option) => (
              <label key={option.value} className={`decision-option${option.disabled ? ' is-disabled' : ''}`}>
                <input
                  type="radio"
                  name="decision"
                  value={option.value}
                  checked={choice === option.value}
                  disabled={option.disabled}
                  onChange={() => pick(option.value)}
                  aria-labelledby={`decision-${option.value}-label`}
                  aria-describedby={`decision-${option.value}-desc`}
                />
                <span className="decision-option-text">
                  <span id={`decision-${option.value}-label`} className="decision-option-label">{option.label}</span>
                  <span id={`decision-${option.value}-desc`} className="decision-option-desc">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {choice !== 'approve' && (
            <div className="decision-summary">
              <label htmlFor="decision-summary-field">
                Summary for the agent <span className="decision-optional">(optional)</span>
              </label>
              <textarea
                id="decision-summary-field"
                className="decision-summary-field"
                rows={2}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </div>
          )}

          {choice !== 'feedback' && approvalWarning}
          {info && <p className="decision-info">{info}</p>}
          {confirming && (
            <p className="decision-confirm" role="alert">
              This discards {plural(counts.notes, 'note')}. Select Approve again to confirm.
            </p>
          )}

          <div className="decision-footer">
            <span className="decision-hint"><kbd>{MOD} ↵</kbd> submit</span>
            <button type="button" className="btn" onClick={close}>Back</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {confirming ? 'Discard and approve' : submitLabel(choice, counts)}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
