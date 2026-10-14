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
  const byPath = threads
    .filter((t) => t.anchor !== 'orphan')
    .reduce((groups, thread) => {
      const path = thread.place?.path ?? null
      return new Map(groups).set(path, [...(groups.get(path) ?? []), thread])
    }, new Map())
  return { files: [...byPath].map(([path, grouped]) => ({ path, threads: grouped })), orphans: orphanThreads(threads) }
}

const ORPHAN_HEADINGS = { changes: 'No longer in the changes', markdown: 'No longer in the document' }

// Where the note is now, or for one whose text is gone, the text it was on.
function placeLine(thread) {
  if (thread.anchor === 'orphan') { return thread.quote ? `“${excerpt(thread.quote)}”` : null }
  if (!thread.place?.where) { return null }
  return thread.anchor === 'moved' ? `${thread.place.where} · moved` : thread.place.where
}

// `focusTick` changes whenever the reviewer asks to reply, which also moves the focus into an open thread's field.
function ThreadDetail({ thread, round, id, onReload, focusTick }) {
  const [error, setError] = useState(null)
  const fieldRef = useRef(null)
  const removingRef = useRef(false)
  useEffect(() => { fieldRef.current?.focus() }, [focusTick])

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

function ThreadItems({ threads, idPrefix, open, ...actions }) {
  return threads.map((thread) => (
    <ThreadItem key={thread.handle} thread={thread} isOpen={open === thread.handle} id={`${idPrefix}-${thread.handle}`} {...actions} />
  ))
}

function ThreadItem({ thread, round, isOpen, onToggle, onReply, onReload, focusTick, id }) {
  return (
    <>
      <ThreadEntry
        thread={thread} round={round} place={placeLine(thread)} expanded={isOpen} controls={id}
        onActivate={() => onToggle(thread)} onReply={() => onReply(thread)}
      />
      {isOpen && <ThreadDetail thread={thread} round={round} id={id} onReload={onReload} focusTick={focusTick} />}
    </>
  )
}

/**
 * Last round's notes the agent answered, by file, with the reviewer's reply
 * field. A card opens or closes its thread and shows its text in the
 * document, Reply opens it with the focus in the field. `focusRequest`
 * (`{ handle }`) does the same from outside, such as the open questions in
 * the decision dialog. `kind` is `markdown` or `changes`.
 */
export function RepliesPanel({ round, threads, multiFile, kind = 'markdown', onLocate, onReload, focusRequest = null }) {
  const [open, setOpen] = useState(focusRequest?.handle ?? null)
  const [focusTick, setFocusTick] = useState(0)
  const idPrefix = useId()
  const reply = (handle) => {
    setOpen(handle)
    setFocusTick((n) => n + 1)
  }
  useEffect(() => { if (focusRequest) { reply(focusRequest.handle) } }, [focusRequest])
  const { files, orphans } = groupThreads(threads)
  const toSend = pendingReplyCount(threads)
  const toggle = (thread) => {
    setOpen((current) => (current === thread.handle ? null : thread.handle))
    onLocate(thread)
  }
  const items = { round, open, onToggle: toggle, onReply: (thread) => reply(thread.handle), onReload, focusTick, idPrefix }

  return (
    <section className="previous-round-panel replies-panel" aria-labelledby={`${idPrefix}-title`}>
      <h3 id={`${idPrefix}-title`} className="replies-panel-title">
        <span className="previous-round-title">Round {round} replies</span> <span className="panel-badge">{threads.length}</span>
        {toSend > 0 && <span className="previous-round-to-send">· {toSend} to send</span>}
      </h3>
      {files.map((group) => (
        <section key={group.path ?? 'general'} className="note-file" aria-label={multiFile ? (group.path ?? 'General comments') : undefined}>
          {multiFile && group.path && <h4 className="note-file-title">{group.path}</h4>}
          <ul className="previous-round-list"><ThreadItems threads={group.threads} {...items} /></ul>
        </section>
      ))}
      {orphans.length > 0 && (
        <>
          <h4 className="previous-round-heading">{ORPHAN_HEADINGS[kind] ?? ORPHAN_HEADINGS.markdown}</h4>
          <ul className="previous-round-list"><ThreadItems threads={orphans} {...items} /></ul>
        </>
      )}
    </section>
  )
}
