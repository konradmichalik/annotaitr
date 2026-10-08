import { useState } from 'react'
import { agentName } from '../utils/origin.js'
import { countsLabel, previewNotes } from '../utils/done.js'
import { intentBadgeStyle, intentWord } from '../utils/intents.js'
import { plural } from '../utils/decision.js'
import { Logo } from './Logo.jsx'

const ICON_PROPS = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

const ICONS = {
  sent: <svg {...ICON_PROPS}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>,
  check: <svg {...ICON_PROPS}><polyline points="20 6 9 17 4 12" /></svg>,
  unlinked: (
    <svg {...ICON_PROPS}>
      <path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 0 1 4 8" /><line x1="8" y1="12" x2="12" y2="12" /><line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}

// A file is named by its name alone, the full path is in the tooltip; a URL stays whole.
const shortTarget = (target) => (/^https?:\/\//.test(target) ? target : target.split(/[\\/]/).pop())

function NoteRows({ notes, more, label, dashed = false }) {
  return (
    <div className={`done-notes${dashed ? ' done-notes--context' : ''}`}>
      <ul className="done-note-list" aria-label={label}>
        {notes.map((note) => (
          <li key={note.id} className="done-note">
            <span className="done-note-badge" style={intentBadgeStyle(note.intent)} aria-hidden={!note.number}>{note.number ?? ''}</span>
            <span className="done-note-text">{note.text}</span>
            <span className="done-note-intent" style={note.intent ? { color: `var(--intent-${note.intent}-label)` } : undefined}>{intentWord(note.intent)}</span>
          </li>
        ))}
      </ul>
      {more && <p className="done-note-more">{more}</p>}
    </div>
  )
}

/**
 * The countdown line: a bar that shrinks over the delay (only where motion
 * is welcome), the seconds left and Keep open. Not a live region, so a
 * screen reader is not told every second.
 */
function Countdown({ state, onKeepOpen }) {
  if (state.phase === 'counting') {
    return (
      <div className="done-countdown">
        <span className="done-countdown-bar" style={{ '--countdown': `${state.total}s` }} aria-hidden="true"><span /></span>
        <span>Closes in {state.remaining} s</span>
        <button type="button" className="done-text-btn" onClick={onKeepOpen}>Keep open</button>
      </div>
    )
  }
  const lines = {
    off: 'You can close this tab.',
    kept: 'This tab stays open until you close it.',
    closeFailed: 'The browser kept this tab open. You can close it.'
  }
  return lines[state.phase] ? <p className="done-countdown">{lines[state.phase]}</p> : null
}

function DoneShell({ children }) {
  return (
    <main className="done-screen canvas-surface">
      {children}
      <Logo className="done-logo" />
    </main>
  )
}

function Heading({ icon, tone, title, subtitle }) {
  return (
    <div className="done-heading">
      <span className={`done-icon done-icon--${tone}`}>{ICONS[icon]}</span>
      <div>
        <h1 className="done-title">{title}</h1>
        <p className="done-subtitle">{subtitle}</p>
      </div>
    </div>
  )
}

/** Copy, save and export for notes that never reached the agent; each action reports back in one status line. */
function RescueActions({ actions }) {
  const [message, setMessage] = useState('')
  const run = (action) => async () => {
    try {
      await action.run()
      setMessage(action.done)
    } catch (error) {
      setMessage(`Could not ${action.label.toLowerCase()}: ${error.message}`)
    }
  }
  return (
    <>
      <div className="done-actions">
        {actions.map((action, index) => (
          <button key={action.label} type="button" className={`btn${index === 0 ? ' btn-primary' : ''}`} onClick={run(action)}>
            {action.label}
          </button>
        ))}
      </div>
      <p className="done-action-status" role="status">{message}</p>
    </>
  )
}

/**
 * The page after the review: what was sent (Send feedback), that nothing
 * changes (Approve), the notes passed as context (Approve with notes), or,
 * when the session ended first, that nothing was delivered and how to keep
 * the notes. `notes` are `{ id, number, intent, text }`; `outcome` comes from doneOutcome().
 */
export function DoneScreen({ outcome, origin, target, notes = [], replies = 0, countdown, onKeepOpen, actions = [], reconnecting = false }) {
  const agent = agentName(origin)
  const subject = agent ?? 'The agent'
  const { shown, more } = previewNotes(notes, replies)
  const countdownLine = <Countdown state={countdown} onKeepOpen={onKeepOpen} />

  if (outcome === 'gone') {
    return (
      <DoneShell>
        <div className="done-card">
          <div role="alert">
            <Heading icon="unlinked" tone="warn" title={`${subject} stopped waiting`} subtitle="The session ended before your decision arrived" />
            <p className="done-box">
              {notes.length > 0
                ? <>Your {plural(notes.length, 'note')} {notes.length === 1 ? 'was' : 'were'} <strong>not delivered</strong>. Take them with you and paste them into the next session.</>
                : <>Nothing was <strong>delivered</strong>, and this round has no notes to keep.</>}
            </p>
          </div>
          {notes.length > 0 && <RescueActions actions={actions} />}
          <p className="done-countdown">
            {reconnecting ? 'Trying to reach the session again. ' : ''}This tab stays open until you close it.
          </p>
        </div>
      </DoneShell>
    )
  }

  if (outcome === 'approved') {
    return (
      <DoneShell>
        <div className="done-card done-card--centered">
          <div role="status">
            <span className="done-icon done-icon--ok done-icon--round">{ICONS.check}</span>
            <h1 className="done-title">Approved</h1>
            <p className="done-subtitle">
              {subject} continues without changes{target ? <> to <code className="done-target" title={target}>{shortTarget(target)}</code></> : null}.
            </p>
          </div>
          {countdownLine}
        </div>
      </DoneShell>
    )
  }

  if (outcome === 'approved-notes') {
    return (
      <DoneShell>
        <div className="done-card">
          <div role="status">
            <Heading
              icon="check" tone="ok"
              title={`Approved with ${countsLabel(notes.length, replies)}`}
              subtitle={`${subject} keeps ${notes.length + replies === 1 ? 'it' : 'them'} as context, nothing gets changed`}
            />
            {shown.length > 0 && <NoteRows notes={shown} more={more} label="Notes passed as context" dashed />}
          </div>
          {countdownLine}
        </div>
      </DoneShell>
    )
  }

  return (
    <DoneShell>
      <div className="done-card">
        <div role="status">
          <Heading icon="sent" tone="ink" title={`Sent to ${agent ?? 'the agent'}`} subtitle={countsLabel(notes.length, replies)} />
          {(shown.length > 0 || more) && <NoteRows notes={shown} more={more} label="Sent notes" />}
        </div>
        {countdownLine}
      </div>
    </DoneShell>
  )
}
