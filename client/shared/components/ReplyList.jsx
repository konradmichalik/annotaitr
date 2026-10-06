import StatusChip from './StatusChip.jsx'

export default function ReplyList({ replies, display }) {
  return (
    <ol className="reply-list">
      {replies.map((reply, index) => (
        <li key={index} className="reply-list-item">
          <StatusChip status={reply.status} display={display} />
          <p className="reply-list-text">{reply.text}</p>
          <time className="reply-list-time" dateTime={new Date(reply.createdAt).toISOString()}>
            {new Date(reply.createdAt).toLocaleString()}
          </time>
        </li>
      ))}
    </ol>
  )
}
