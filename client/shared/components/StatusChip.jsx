export default function StatusChip({ status, display }) {
  const { icon, label } = display[status] ?? display.none
  return (
    <span className={`status-chip status-chip--${status}`}>
      <span aria-hidden="true">{icon}</span> <span className="status-chip-label">{label}</span>
    </span>
  )
}
