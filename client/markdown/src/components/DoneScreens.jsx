import { DoneScreen } from '../../../shared/components/DoneScreen.jsx'
import { intentOf } from '../../../shared/utils/intents.js'
import { copyToClipboard, downloadAsJsonFile, formatAnnotationsForExport, formatAnnotationsForJsonExport } from '../utils/export.js'

// Agent notes from --feedback-notes are context the agent wrote, not the reviewer's notes.
const ownNotes = (file) => file.annState.annotations.filter((a) => a.type !== 'NOTES')

function noteRow(annotation) {
  const quoted = annotation.originalText ? `“${annotation.originalText}”` : ''
  return { id: annotation.id, number: annotation.number ?? null, intent: intentOf(annotation), text: annotation.text || quoted }
}

const baseName = (path) => path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '') || 'annotations'

/** Every file's notes as Markdown, and one JSON export per file, for the next session. */
function rescueActions(files) {
  const withNotes = files.filter((file) => ownNotes(file).length > 0)
  return [
    {
      label: 'Copy as Markdown',
      done: 'Copied as Markdown',
      run: () => copyToClipboard(withNotes.map((file) => formatAnnotationsForExport(ownNotes(file), file.blocks, file.path)).join('\n\n'))
    },
    {
      label: 'Export JSON',
      done: 'Exported as JSON',
      run: async () => {
        for (const file of withNotes) {
          downloadAsJsonFile(formatAnnotationsForJsonExport(ownNotes(file), file.path, file.contentHash), `${baseName(file.path)}-annotations.json`)
        }
      }
    }
  ]
}

/** The markdown review's done page, for each outcome of doneOutcome(). */
export function MarkdownDoneScreen({ outcome, files, origin, target, countdown, onKeepOpen, reconnecting }) {
  const notes = files.flatMap((file) => ownNotes(file).map(noteRow))
  return (
    <DoneScreen
      outcome={outcome}
      origin={origin}
      target={target}
      notes={outcome === 'approved' ? [] : notes}
      countdown={countdown}
      onKeepOpen={onKeepOpen}
      actions={outcome === 'gone' ? rescueActions(files) : []}
      reconnecting={reconnecting}
    />
  )
}
