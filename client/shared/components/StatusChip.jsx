export default function StatusChip({ status, display }) {
  const { icon, label } = display[status]
  return (
    <span className={`status-chip status-chip--${status}`}>
      <span aria-hidden="true">{icon}</span> {label}
    </span>
  )
}
