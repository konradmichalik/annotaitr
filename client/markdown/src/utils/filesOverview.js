import { isNumbered } from '../../../shared/utils/intents.js'
import { shortFileNames } from './export.js'

/**
 * The sidebar's Files section: each file by its short name, with the number
 * of the reviewer's notes and whether it is reviewed, opened or not opened
 * yet, plus how many of all files are reviewed.
 */
export function filesOverview(files) {
  const names = shortFileNames(files.map((file) => file.path))
  const rows = files.map((file, index) => {
    let state = 'not-opened'
    if (file.reviewed) { state = 'reviewed' } else if (file.opened) { state = 'opened' }
    return { path: file.path, name: names[index], count: file.annState.annotations.filter(isNumbered).length, state }
  })
  const reviewed = rows.filter((row) => row.state === 'reviewed').length
  return { rows, reviewed, total: files.length, summary: `${reviewed} of ${files.length} reviewed` }
}
