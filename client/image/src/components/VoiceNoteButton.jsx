import { useVoiceNote } from '../hooks/useVoiceNote.js'
import { PLAYER_ICONS } from '../utils/icons.jsx'

const formatSeconds = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/**
 * Speak a comment instead of typing it. The transcript lands in the text
 * field, so it can be corrected before the annotation is saved.
 */
export default function VoiceNoteButton({ onText }) {
  const { status, error, seconds, start, stop } = useVoiceNote(onText)

  if (status === 'recording') {
    return (
      <button type="button" className="voice-note voice-note--recording" onClick={stop} aria-label={`Stop recording, ${formatSeconds(seconds)}`}>
        <span className="voice-note-dot" aria-hidden="true" />
        {formatSeconds(seconds)}
        <span className="voice-note-action">Stop</span>
      </button>
    )
  }

  if (status === 'starting' || status === 'transcribing') {
    return (
      <span className="voice-note voice-note--busy" role="status">
        <span className="voice-note-spinner" aria-hidden="true" />
        {status === 'starting' ? 'Allow microphone…' : 'Transcribing…'}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        className="voice-note"
        onClick={start}
        aria-label="Record a voice note"
        title="Speak your comment instead of typing it. It is transcribed on this machine, and you can edit the text before saving."
      >
        {PLAYER_ICONS.microphone}
      </button>
      {status === 'error' && <span className="voice-note-error" role="alert">{error}</span>}
    </>
  )
}
