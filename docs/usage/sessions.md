# Review sessions

Every review remembers its rounds in a session, so an agent can answer every
mark and the next round can show those answers: an image, URL, video or PDF,
a set of Markdown or plain-text files, and `annotaitr changes`. Every decision with at
least one mark ends with a line naming the session:

```text
Session: 2f8c1a9e04b7 (round 1). Reply per mark with: annotaitr reply --session 2f8c1a9e04b7 --to <handle> --status applied|partial|declined|deferred|question --text "…"
```

The agent answers one mark per call, quoting the handle from the feedback
(`[#a3f19c2e]`, with or without `#`):

```bash
annotaitr reply --session 2f8c1a9e04b7 --to a3f19c2e --status applied --text "Moved the button below the form"
```

| Status | Meaning | The text states |
|--------|---------|-----------------|
| `applied` | Done as asked | what was changed |
| `partial` | Partially done | what is left |
| `declined` | Deliberately not done | why |
| `deferred` | Out of scope for this round | when or under what condition |
| `question` | Needs a decision first | the question (ask it in chat as well) |

`reply` checks the session, the handle, the status and the text (required,
at most 4000 characters) before writing, and exits `1` with the reason when
one of them is wrong.

Opening the same target again within 24 hours continues its session and
starts the next round; a line on stderr says so. The same target is:

| Review | Same target |
|--------|-------------|
| Image, URL, video, PDF | the same file or URL |
| Markdown and plain text | the same set of files, in any order |
| `annotaitr changes` | the same repository, branch and comparison (`--base` or uncommitted), whatever new commits it gained |

`--new-session` starts over, `--session <id>` continues a specific session,
which is the only way to continue one for a clipboard image. Both work for
every target kind, including `annotaitr changes`.

`--feedback-notes` stays for Markdown: it carries notes that belong to no
handle, such as a summary of what changed. An answer to a mark always goes
through `annotaitr reply`.

Sessions are JSON files in `<tmpdir>/annotaitr-sessions` (or
`ANNOTAITR_SESSION_DIR`), readable by the current user only, and deleted
after 7 days. They hold the review comments, so a session is only written
into a folder owned by the current user and closed to others (`chmod 700`);
an existing `ANNOTAITR_SESSION_DIR` must meet that too. If a session cannot be
saved, a warning goes to stderr and the decision is printed as usual. Several
`reply` calls may run at the same time, each waits for the others.

## Markdown and changes

A Markdown session stores each round's notes with the quoted text and, for a
document, the file's content, so the next round can find the text again. A
`changes` session stores only the commit, the merge base and a hash of the
working tree, never the code. The next round places each earlier note:

- **exact**: the file is unchanged, the note stays where it was
- **moved**: the quoted text, checked against the text around it, is found in
  exactly one place in the edited file
- **orphan**: the text is gone, or now appears in several places. The
  **Replies** tab lists it under "No longer in the document" with the
  original quote

Placed notes from the earlier round are underlined dashed and grey in the
preview and never compete with new notes. Clicking a thread in the **Replies**
tab scrolls to its text, switching file or leaving the source view when
needed. With several files open the tab groups the threads by file. A general
comment always keeps its place.

In the agent's output the heading names where the text is now, or "no longer
in the document"; the quote line keeps where it was in round N:

```text
### [#a3f19c2e] Change · Text (Line 5, docs/guide.md)
Selected: `intro says hello`
> Round 1, mark 1 (Line 3): Make this friendlier
Agent (question): Warmer or shorter?
Reviewer: Warmer
```

## Replying to the agent

In round 2 the reviewer can answer a thread from the previous round in the
annotator. Opening a thread, from its badge on the canvas (image mode) or from the
"Round 1 replies" section under the panel's **Replies** tab, shows a "Reply to the agent" field. **Reply**, or Ctrl/Cmd+Enter,
stores the reply as "Pending, sent with your decision". It can be removed
until the decision is submitted. Each thread in the **Replies** tab is a
card: the note's number in a dashed grey badge, the agent's status as icon
and word, "You: ..." with the note, "Agent: ..." with the last reply and a
**Reply** button that opens the thread. A reply of the reviewer's own shows as
"You: ... · pending" until it is sent. The section counts them as "· N to
send", and a thread with a pending reply
carries a ↩ mark on its canvas badge in image mode. A decision may carry only replies and no
new marks, so the main button reads Send feedback with replies alone.

While the agent's questions are unanswered, the main button (Approve or Send
feedback) opens the decision dialog first, with that option selected and the
open questions listed ("The agent asked N questions you have not answered"),
with an Answer button. It never blocks the decision. A round with only replies sent as feedback starts with
`Feedback: 1 reply to round 1, no new marks.`, or
`APPROVED WITH NOTES: 1 reply to round 1. ...` when the target is approved.

The agent sees the exchange under "Replies to round N", after the feedback for
any new marks and before the `Session:` line:

```text
## Replies to round 1

### [#b7210e44] Question · Comment pin: bottom (~80% from top, ~50% from left)
> Round 1, mark 2: Button-Farbe passt nicht zur CI
Agent (question): Soll es das CI-Grün #2e7d32 sein oder das Blau aus dem Header?
Reviewer: CI-Grün #2e7d32
```

Answered threads continue into the next round on the same handle, so
`annotaitr reply --to <handle>` works on them. All other threads end with the
decision.
