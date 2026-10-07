/**
 * The two-way switch under the panel title, as tabs: the arrow keys move
 * between them, the tab panel below is labelled by the selected one.
 * `options` is a list of `{ id, label }`.
 */
export function PanelSwitch({ label, options, value, onChange, panelId }) {
  const handleKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') { return }
    event.preventDefault()
    const index = options.findIndex((option) => option.id === value)
    const next = options[(index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length]
    onChange(next.id)
    event.currentTarget.querySelector(`#panel-tab-${next.id}`)?.focus()
  }
  return (
    <div className="panel-switch" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
      {options.map((option) => (
        <button
          key={option.id}
          id={`panel-tab-${option.id}`}
          type="button"
          role="tab"
          aria-selected={option.id === value}
          aria-controls={panelId}
          tabIndex={option.id === value ? 0 : -1}
          className={`panel-switch-tab${option.id === value ? ' active' : ''}`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
