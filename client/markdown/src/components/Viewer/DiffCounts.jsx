/** Added and removed lines as `+75 −2`, in the diff colours. */
export function DiffCounts({ added, removed, className }) {
  return (
    <span className={className}>
      <span className="diff-count-add">+{added}</span>{' '}
      <span className="diff-count-del">{'\u2212'}{removed}</span>
    </span>
  )
}
