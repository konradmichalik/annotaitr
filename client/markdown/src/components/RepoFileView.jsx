import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { splitLines } from '../utils/fileLines.js'

async function fetchFile(path) {
  const json = await (await fetch(`/api/changes/file?path=${encodeURIComponent(path)}`)).json()
  if (!json.success) { throw new Error('not available') }
  return json.data
}

/** A file of the repository that is not part of the changes, to read with its line numbers. */
export function RepoFileView({ path, onBack }) {
  const headingId = useId()
  const sectionRef = useRef(null)
  const [state, setState] = useState({ status: 'loading', file: null })

  useEffect(() => {
    let current = true
    setState({ status: 'loading', file: null })
    fetchFile(path)
      .then((file) => { if (current) { setState({ status: 'ready', file }) } })
      .catch(() => { if (current) { setState({ status: 'error', file: null }) } })
    return () => { current = false }
  }, [path])

  // Opening a file from the tree moves the reader to it, as a jump to a file card does.
  useEffect(() => { sectionRef.current?.focus({ preventScroll: true }) }, [path])

  const lines = useMemo(() => (state.file?.content === undefined ? null : splitLines(state.file.content)), [state.file])

  return (
    <section ref={sectionRef} className="repo-file" aria-labelledby={headingId} tabIndex={-1}>
      <header className="repo-file-header">
        <button type="button" className="repo-file-back" onClick={onBack}>Back to changes</button>
        <h2 id={headingId} className="repo-file-path">{path}</h2>
      </header>
      <p className="repo-file-note">Read only. Notes go on the changes.</p>
      <p className="visually-hidden" role="status">{state.status === 'loading' ? 'Loading the file…' : ''}</p>
      {state.status === 'loading' && <p className="repo-file-note">Loading the file…</p>}
      {state.status === 'error' && <p className="repo-file-note" role="alert">The file could not be loaded.</p>}
      {state.file?.omitted && <p className="repo-file-note">This file is not shown: {state.file.omitted}.</p>}
      {lines && lines.length === 0 && <p className="repo-file-note">The file is empty.</p>}
      {lines && lines.length > 0 && (
        <table className="repo-file-lines">
          <caption className="visually-hidden">Lines of {path}, {lines.length} {lines.length === 1 ? 'line' : 'lines'}</caption>
          <tbody>
            {lines.map((text, i) => (
              <tr key={i}>
                <th scope="row" className="repo-file-number">{i + 1}</th>
                <td className="repo-file-code"><code>{text || ' '}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
