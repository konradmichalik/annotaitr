import { useState } from 'react'
import { shortcutGroups } from '../utils/shortcuts.js'

function Keys({ item }) {
  if (item.range) {
    const [last, ...rest] = [...item.keys].reverse()
    return (
      <span className="shortcut-keys">
        {rest.reverse().map((key) => <kbd key={key}>{key}</kbd>)}
        <span aria-hidden="true">–</span>
        <span className="visually-hidden">to</span>
        <kbd>{last}</kbd>
      </span>
    )
  }
  return <span className="shortcut-keys">{item.keys.map((key) => <kbd key={key}>{key}</kbd>)}</span>
}

/** The shortcuts of the open mode, grouped and searchable. */
export function ShortcutList({ kind, searchRef }) {
  const [query, setQuery] = useState('')
  const groups = shortcutGroups(kind, query)
  return (
    <div className="shortcuts">
      <label className="visually-hidden" htmlFor="shortcuts-search">Search shortcuts</label>
      <input
        ref={searchRef}
        id="shortcuts-search"
        type="search"
        className="shortcuts-search"
        placeholder="Search shortcuts"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {groups.length === 0 && <p className="shortcuts-empty" role="status">No shortcut matches “{query}”.</p>}
      <div className="shortcuts-groups">
        {groups.map((group) => (
          <section key={group.id} className="shortcuts-group" aria-labelledby={`shortcuts-${group.id}`}>
            <h4 id={`shortcuts-${group.id}`} className="shortcuts-group-title">{group.title}</h4>
            <ul className="shortcuts-list">
              {group.items.map((item) => (
                <li key={item.label} className="shortcut-row">
                  <span className="shortcut-label">{item.label}</span>
                  <Keys item={item} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
