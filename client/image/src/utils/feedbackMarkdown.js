import { isGeneral } from '../../../shared/utils/intents.js'
import { noteType } from '../../../shared/utils/noteTypes.js'

/**
 * The notes as Markdown for pasting into another session, built in the
 * browser because it is needed when the server is gone. Shorter than the
 * agent's stdout: one line per note with its number, intent, shape and
 * where it sits (`locate` returns a page or a time, or null).
 */
export function feedbackMarkdown(annotations, { target = null, locate = null } = {}) {
  const general = annotations.filter(isGeneral)
  const numbered = annotations.filter((a) => !isGeneral(a)).sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  const lines = [`# Feedback${target ? ` on ${target}` : ''}`, '']
  for (const annotation of numbered) {
    const { word, shape } = noteType(annotation)
    const where = [shape, locate?.(annotation)].filter(Boolean).join(', ')
    lines.push(`${annotation.number}. **${word}** (${where}): ${annotation.text || '(no comment)'}`)
  }
  for (const annotation of general) {
    const where = locate?.(annotation)
    lines.push(`- **General**${where ? ` (${where})` : ''}: ${annotation.text}`)
  }
  return `${lines.join('\n')}\n`
}
