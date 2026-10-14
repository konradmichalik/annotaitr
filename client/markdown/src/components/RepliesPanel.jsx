import { useEffect, useId, useRef, useState } from 'react'
import ThreadEntry from '../../../shared/threads/ThreadEntry.jsx'
import ReplyForm from '../../../shared/threads/ReplyForm.jsx'
import ReplyList from '../../../shared/components/ReplyList.jsx'
import { removeReply } from '../../../shared/threads/replyApi.js'
import {
  STATUS_DISPLAY, AUTHOR_LABELS, AUTHOR_AVATARS, orphanThreads, pendingReplyCount, threadMessages
} from '../../../shared/threads/threadView.js'

const excerpt = (text) => (text && text.length > 80 ? `${text.slice(0, 80)}…` : text)

/** Placed threads by file, in the order the files first appear, and the orphans apart. General comments have no file. */
export function groupThreads(threads) {
  const files = []
  for (const thread of threads.filter((t) => t.anchor !== 'orphan')) {
    const path = thread.place?.path ?? null
    const group = files.find((f) => f.path === path)
    if (group) { group.threads.push(thread) } else { files.push({ path, threads: [thread] }) }
  }
  return { files, orphans: orphanThreads(threads) }
}

// Where the note is now, or for one whose text is gone, the text it was on.
function placeLine(thread) {
  if (thread.anchor === 'orphan') { return thread.quote ? `“${excerpt(thread.quote)}”` : null }
  if (!thread.place?.where) { return null }
  return thread.anchor === 'moved' ? `${thread.place.where} · moved` : thread.place.where
}

function ThreadDetail({ thread, round, id, onReload }) {
  const [error, setError] = useState(null)
  const fieldRef = useRef(null)
  const removingRef = useRef(false)
  useEffect(() => { fieldRef.current?.focus() }, [])

  const handleRemove = async (reply) => {
    if (removingRef.current) { return }
    removingRef.current = true
    const result = await removeReply(thread.handle, reply.id)
    removingRef.current = false
    setError(result.error ?? null)
    // The Remove button unmounts with the reply, so focus would drop to the page.
    fieldRef.current?.focus()
    onReload()
  }
  return (
    <li id={id} className="reply-thread">
      <ReplyList
        replies={threadMessages(thread, round)} display={STATUS_DISPLAY} labels={AUTHOR_LABELS} avatars={AUTHOR_AVATARS}
        pendingLabel="Pending, sent with your decision" onRemove={handleRemove}
      />
      {thread.replies.length === 0 && <p className="reply-thread-empty">No reply from the agent yet.</p>}
      <ReplyForm handle={thread.handle} error={error} onError={setError} fieldRef={fieldRef} onSent={onReload} />
    </li>
  )
}

function ThreadItems({ threads, round, open, onToggle, onReload, idPrefix }) {
  return threads.map((thread) => (
    <ThreadItem key={thread.handle} thread={thread} round={round} isOpen={open === thread.handle} onToggle={onToggle} onReload={onReload} id={`${idPrefix}-${thread.handle}`} />
  ))
}

function ThreadItem({ thread, round, isOpen, onToggle, onReload, id }) {
  return (
    <>
      <ThreadEntry thread={thread} round={round} place={placeLine(thread)} expanded={isOpen} onActivate={() => onToggle(thread)} />
      {isOpen && <ThreadDetail thread={thread} round={round} id={id} onReload={onReload} />}
    </>
  )
}

/**
 * Last round's notes the agent answered, by file, with the reviewer's reply
 * field. A card opens its thread and shows its text in the document;
 * `focusHandle` opens a thread from outside, such as the open questions in
 * the decision dialog.
 */
export function RepliesPanel({ round, threads, multiFile, onLocate, onReload, focusHandle = null }) {
  const [open, setOpen] = useState(focusHandle)
  const idPrefix = useId()
  useEffect(() => { if (focusHandle) { setOpen(focusHandle) } }, [focusHandle])
  const { files, orphans } = groupThreads(threads)
  const toSend = pendingReplyCount(threads)
  const toggle = (thread) => {
    setOpen((current) => (current === thread.handle ? null : thread.handle))
    onLocate(thread)
  }
  const items = { round, open, onToggle: toggle, onReload, idPrefix }

  return (
    <section className="previous-round-panel replies-panel" aria-labelledby={`${idPrefix}-title`}>
      <h3 id={`${idPrefix}-title`} className="replies-panel-title">
        <span className="previous-round-title">Round {round} replies</span> <span className="panel-badge">{threads.length}</span>
        {toSend > 0 && <span className="previous-round-to-send">· {toSend} to send</span>}
      </h3>
      {files.map((group) => (
        <section key={group.path ?? 'general'} className="note-file" aria-label={group.path ?? 'General comments'}>
          {multiFile && group.path && <h3 className="note-file-title">{group.path}</h3>}
          <ul className="previous-round-list"><ThreadItems threads={group.threads} {...items} /></ul>
        </section>
      ))}
      {orphans.length > 0 && (
        <>
          <h3 className="previous-round-heading">No longer in the document</h3>
          <ul className="previous-round-list"><ThreadItems threads={orphans} {...items} /></ul>
        </>
      )}
    </section>
  )
}
