import { KeyCap } from './KeyCap.jsx'
import { InfoIcon } from './HeaderIcons.jsx'

/**
 * The panel before the first note: what a note becomes, the main tool keys
 * (`keys`: `{ key, label }`) and, while nothing would be sent, that the
 * main button approves.
 */
export function PanelEmpty({ lead, keys, approves }) {
  return (
    <div className="panel-empty">
      <h3 className="panel-empty-title">Nothing marked yet</h3>
      <p className="panel-empty-lead">{lead}</p>
      <ul className="panel-empty-keys">
        {keys.map(({ key, label }) => (
          <li key={label}><KeyCap>{key}</KeyCap> {label}</li>
        ))}
      </ul>
      {approves && (
        <p className="panel-empty-note">
          <InfoIcon />
          <span>With no notes the main button reads <strong>Approve</strong>.</span>
        </p>
      )}
    </div>
  )
}
