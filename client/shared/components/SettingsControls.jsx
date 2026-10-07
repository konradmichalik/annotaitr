/**
 * The controls of the settings dialog. A row names its control through
 * `<id>-label` and `<id>-desc`, so every control has a name and a description.
 */

export function SettingRow({ id, label, description, labelFor = null, children }) {
  const Label = labelFor ? 'label' : 'span'
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <Label id={`${id}-label`} className="settings-row-label" {...(labelFor ? { htmlFor: labelFor } : {})}>{label}</Label>
        {description && <span id={`${id}-desc`} className="settings-row-desc">{description}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

/** Mutually exclusive options as native radios, so the arrow keys move between them. */
export function SegmentedControl({ id, options, value, onChange }) {
  return (
    <div className="settings-segmented" role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={`${id}-desc`}>
      {options.map((option) => (
        <label key={option.value} className="settings-segmented-option">
          <input
            type="radio"
            className="settings-segmented-input"
            name={id}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="settings-segmented-text">{option.label}</span>
        </label>
      ))}
    </div>
  )
}

export function Toggle({ id, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-desc`}
      className="settings-toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-thumb" />
    </button>
  )
}

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'System' }
]

/** Light, Dark and System as preview tiles; `auto` is the stored value of System. */
export function ThemeTiles({ value, onChange }) {
  return (
    <fieldset className="settings-themes">
      <legend className="settings-row-label">Theme</legend>
      <div className="settings-theme-tiles">
        {THEMES.map((theme) => (
          <label key={theme.value} className="settings-theme">
            <span className={`settings-theme-preview settings-theme-preview--${theme.value}`} aria-hidden="true">
              <span className="settings-theme-page" />
              <span className="settings-theme-panel" />
            </span>
            <span className="settings-theme-choice">
              <input type="radio" name="theme" checked={value === theme.value} onChange={() => onChange(theme.value)} />
              {theme.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
