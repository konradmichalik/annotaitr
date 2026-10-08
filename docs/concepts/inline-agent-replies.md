# Concept: Inline agent replies

Status: draft 2 / for discussion
Scope: both modes (markdown, image)
Related: [How it works](../how-it-works.md) → "The review loop"

## 1. Problem

The review loop is one-directional *inside the document*. A reviewer marks a
document up, the agent receives structured feedback, the agent changes things
and re-opens the annotator. What the agent actually did about each individual
mark reaches the reviewer only as prose in the terminal, which is precisely
the thing annotaitr exists to let people stop watching.

Concretely, this was the code before S1. The baseline is kept because the
reasoning below builds on it; S1 has since closed the first point and gave
markdown global comments a heading:

- **No stable handle.** `exportFeedback()` numbers annotations `## 1.`, `## 2.`
  by document order (`server/markdown/feedback.js`), and
  `exportMultiFileFeedback()` does the same with a running `globalIndex`
  (`feedback.js`). The numbering is recomputed on every call, so
  there is nothing the agent can quote back that survives a second pass.
- **Notes are line-anchored, not annotation-anchored.**
  `convertNotesToAnnotations()` accepts `{ text, line }`
  (`server/markdown/notes.js`). A note says "something happened near line
  5", not "this answers your comment about the intro". If the line is out of
  range, `createLineAnnotation()` silently returns a global annotation
  (`notes.js`), with no signal to the reviewer that the anchor was lost.
- **Notes are read-only and one-way.** Both `exportFeedback()`
  (`feedback.js`) and `exportMultiFileFeedback()` (`feedback.js`)
  filter `type === 'NOTES'` out of the outgoing feedback. A reviewer who
  disagrees with an agent note has no way to say so inside the tool.
- **Image mode has nothing.** `index.js` fails hard with
  `--feedback-notes only applies to markdown targets, not images.`

There is no notion of a round or a session anywhere in `server/` or `client/`
today. `docs/how-it-works.md` uses the word "round" in prose only.

The result is that round 2 of a review is close to a blank slate. The reviewer
re-reads the whole document to work out which of their five points landed, and
the agent never learns that point 3 was misunderstood rather than merely
unpopular.

## 2. Goal

Every annotation becomes a **thread**. The agent's answer to a mark is
rendered *on that mark*, carries an explicit status, and the reviewer can
answer back in place. Same mechanism in both modes, same contract.

**Non-goals.** Not a chat client. Not multi-user or real-time. Not persistent
review history across days. annotaitr is local, ephemeral and single-user, and
should stay that way.

## 3. Design

### 3.1 Stable annotation handles on the wire

The client already mints a UUID per annotation. Surface a short, stable handle
in the feedback markdown so the agent has something to address:

```markdown
## 1. Comment on (Line 42) [#a3f19c2e]
```

**Handle = the first group of the annotation UUID**, which is exactly 8 hex
characters. The full id is matched against the complete UUID shape before the
prefix is taken: validating only the first group would hand `a3f19c2e-foo` and
`a3f19c2e-bar` the same handle, which is the one failure this design cannot
afford. Both client and server derive it independently from the same `id` (the
server for stdout, the client for the markdown copy export), so no shared module
and no ID registry is needed. The number stays for human readability within a
round; the handle carries identity for as long as the annotation exists. S1 does
not make annotations outlive a round: the markdown draft is keyed by the content
hash and is dropped once the agent edits the file. Carrying identity into the
next round is the job of re-anchoring (3.3) and the session file (3.4).

No collision check. At 8 hex characters (32 bits), 100 annotations in a
session collide with probability around 1e-6. The 6 characters proposed in
draft 1 would give roughly 1 in 3400, and the failure mode is a reply silently
attaching to the wrong thread, which is the worst outcome this design has.
More importantly, a session-wide uniqueness check needs a single place where
IDs are minted, and markdown mode does not have one: IDs are generated inline
at four call sites (`client/markdown/src/components/Viewer/Viewer.jsx`
and `client/markdown/src/App.jsx`). Widening the handle keeps S1 a pure
formatting change.

**Prerequisite.** Markdown mode calls bare `crypto.randomUUID()` at those four
sites. Image mode wraps it in `createAnnotationId()` with a manual v4 fallback
for insecure contexts (`client/image/src/state/annotationReducer.js`).
`crypto.randomUUID` is undefined outside a secure context, which a non-loopback
`ANNOTAITR_HOST` produces. Today that is a latent bug; once handles are part of
the agent contract it becomes load-bearing. Port the image-mode helper to
markdown mode as part of S1.

The `id` already survives the POST into the formatters unmodified
(`server/markdown/routes.js`, `server/image/still/routes.js`), so nothing has
to be threaded through.

**The handle is deliberately not written into the JSON export**, which draft 1
called for. The export already carries `id`, and the handle is a pure function
of it, so storing it would persist derived data that can drift from its source
on a hand-edited re-import. Image mode makes the cost concrete: its export is a
bare passthrough of the annotation objects, so an injected `handle` would break
round-trip identity. The handle exists to be quoted in prose, where there is no
`id` to hand; JSON consumers already have the better value. The derivation rule
is documented instead.

**Markdown global comments have no heading to hang a handle on.** They are
emitted as a bare `> text` line with no number and no label
(`server/markdown/feedback.js`). "Every annotation becomes a
thread" is therefore false for them as the output stands. They need a real
heading format, not a splice, and that change belongs in S1 rather than being
discovered in S2. Image mode does not have this gap: it numbers general
comments already (`server/image/common/feedback.js`).

This is the enabling change for everything below, and it is small enough to
ship on its own: even with no other work, an agent can write "fixed
`#a3f19c2e`, skipped `#7b210e44` because …" in chat. The annotator does not
display handles, so on their own they mean nothing to the reviewer. The agent
files therefore tell agents to pair each handle with a few words naming the
passage. Showing handles on the marks themselves belongs to the inline
rendering in S2.

### 3.2 Reply model

```
Thread = Annotation + Reply[]

Reply = {
  id:        string,
  replyTo:   string,          // annotation handle
  author:    'agent' | 'human',
  status:    Status,          // agent replies only
  text:      string,
  evidence?: Evidence,
  createdAt: number
}
```

`Status` is a **closed set**, and every status requires `text`:

| Status     | Meaning                                   | `text` must state |
| ---------- | ----------------------------------------- | ----------------- |
| `applied`  | Done as asked                             | what was changed |
| `partial`  | Partially done                            | what is left |
| `declined` | Deliberately not done, and not planned    | why |
| `deferred` | Acknowledged, out of scope for this round | when or under what condition |
| `question` | Agent needs a decision before acting      | the question |

Draft 1 exempted `applied` and `deferred` from the text requirement. A
`deferred` label with no reason carries the same information as silence, which
is the defect this concept exists to fix, so the exemption is removed. If usage
shows that reviewers do not act differently on `declined` versus `deferred`,
collapse the two rather than keeping a distinction nobody reads.

The set is closed on purpose. Free-form status strings are exactly what makes
the current notes mechanism unusable for UI: the client cannot colour, sort or
filter on prose. The agent's reasoning belongs in `text`; the machine-readable
part belongs in `status`.

`question` **does not make annotaitr the question channel.** The agent can only
write replies after the CLI has exited, so a question answered through a
session file costs a full extra round trip: submit, agent works, agent asks,
agent re-opens, reviewer answers, next round. An agent that has a blocking
question should ask in chat, where the answer is immediate. The `question`
reply is the durable record of that exchange and the trigger for the approval
gate in 3.5, not the means of asking.

`Evidence` is optional and typed, rendered collapsed under the reply:

```
{ kind: 'diff',     patch: string }        // unified diff hunk
{ kind: 'location', file: string, line: number }
{ kind: 'commit',   sha: string, subject?: string }
```

Human replies carry no status. They are plain text, and they reopen a thread
that the agent had marked `applied`.

### 3.3 Re-anchoring across rounds

This is the hard part and the place where the feature quietly fails if it is
done carelessly. Between rounds the agent has edited the document: line numbers
moved, and the annotated text may not exist any more.

**`blockId` cannot be used for this.** The parser assigns
`` id: `block-${currentId++}` `` at every construction site
(`client/markdown/src/utils/parser.js` and ~17 further sites). It is a plain
sequence counter, so inserting a single paragraph near the top renumbers every
block below it. Any implementer reaching for `blockId` as an anchor is building
a silent mis-attachment.

**Anchoring ladder**, evaluated in order when a session is loaded:

0. **Unchanged document.** If the file content hashes identical to the hash
   recorded in the session file, the parser is deterministic and reproduces the
   same `blockId` sequence and offsets. Re-attach directly by
   `blockId` + `startOffset`, exactly, and skip the rest of the ladder. This
   covers the common case where the agent declined or deferred everything, and
   it is the only step in the ladder that is exact rather than probabilistic.
   In markdown mode this reuses shipped infrastructure: a sha256 `contentHash`
   is already computed (`server/markdown/adapter.js`,
   `server/markdown/routes.js`), served to the client
   (`routes.js`), carried in the JSON export, and there is already a
   `hashMismatch` flag (`routes.js`). Image mode has no equivalent, which is
   one more reason the ladder does not apply there (see 3.5).
1. **Exact quote + context.** Store `originalText` plus ~32 characters of
   prefix and suffix (the shape of a W3C `TextQuoteSelector`). A unique match
   in the new content re-anchors the thread cleanly.
2. **Fuzzy quote.** Whitespace-normalised, ≥85 % similarity, exactly one
   candidate → re-anchor and flag the thread `moved`.
3. **Location evidence.** If the agent's reply carries
   `{ kind: 'location', file, line }`, anchor to the block at that line and
   flag `relocated`.
4. **Orphan.** Keep the thread, render it in a dedicated *"no longer in the
   document"* group in the annotation panel, showing the original quote. Never
   drop a thread silently.

Deliberately **not** in v1: diff-based position mapping. It needs the previous
document version in the contract, which is a much larger change, and it is
unclear it beats quote matching for prose. Instead, count `moved` /
`relocated` / `orphan` outcomes per session and log them behind a debug flag.
If orphan rates turn out to be high in real use, that is the evidence for
building it, not a guess made now.

### 3.4 Session file instead of a CLI flag

`--feedback-notes` puts JSON on the command line. A thread payload with diff
evidence is too large and too awkward for argv. Introduce a session file,
written by annotaitr on submit:

```jsonc
{
  "schemaVersion": 1,
  "sessionId": "2f8c1a",
  "round": 2,
  "target": { "mode": "markdown", "files": ["README.md"] },
  "contentHashes": { "README.md": "sha256-…" },
  "threads": [
    {
      "annotation": { "handle": "a3f19c2e", "type": "COMMENT", "…": "…" },
      "anchor":     { "quote": "…", "prefix": "…", "suffix": "…" },
      "replies":    [ { "author": "agent", "status": "applied", "…": "…" } ]
    }
  ]
}
```

Location: `os.tmpdir()` by default, `--session-dir` to override, so nothing
lands in the repo unless the user asks for it.

**Lifecycle**, which draft 1 left open:

- **Discovery.** `sessionId` is derived from a hash of the resolved target
  paths, so re-running `annotaitr README.md` finds the prior session without a
  flag. This removes the failure where a hand-run re-invocation silently starts
  a fresh session and drops every thread.
- **Staleness.** Auto-resume only if the session file was written within 24
  hours. Older files are ignored, and annotaitr prints one line naming the file
  it skipped.
- **Explicit control.** `--session <id>` forces a specific session,
  `--new-session` forces a fresh one. On auto-resume, annotaitr prints one line
  stating the round number and how to start over.
- **Cleanup.** Delete session files older than 7 days on startup. `os.tmpdir()`
  is not reliably cleaned on macOS.
- **Schema mismatch.** Any `schemaVersion` other than the one this build
  understands is ignored with a warning, and a fresh session starts. The file is
  ephemeral and local, so there is no migration story to write.

Flow:

```
annotaitr README.md                       # round 1, prints session path
→ agent writes replies via `annotaitr reply`
annotaitr README.md                       # round 2, threads rendered inline
```

`--feedback-notes` stays as a compatibility shim: `{ text, line }` maps to an
authorless reply on a synthetic global thread, exactly as today.

**Reply input is a subcommand, not hand-edited JSON:**

```
annotaitr reply --to a3f19c2e --status applied --text "…"
```

Draft 1 left this open and proposed prototyping both. The doc's own reasoning
already settles it: validation at write time is the difference between a loud
failure and a silently wrong session file, which is the failure mode this
design can least afford. A subcommand also keeps the JSON schema private
instead of publishing it as a contract the project then has to hold stable. No
plugin abstraction over reply input until there is a third consumer needing a
different shape.

### 3.5 Rendering

**Markdown mode**

- The annotated span gets a status dot in its existing highlight.
  `CommentPopover` grows a thread body: original comment → replies in order →
  reply box.
- `AnnotationPanel` groups by status, in this order:
  1. `question` (blocking)
  2. `partial` / `declined` / `deferred`
  3. **carried over with no reply at all** (raised in an earlier round, never
     answered)
  4. new annotations from this round
  5. `applied`, collapsed
  6. orphans
  Group 3 is absent from draft 1, which lumped unanswered old annotations in
  with new ones. An annotation the agent ignored is the single strongest signal
  in the panel and must not be indistinguishable from one the reviewer just
  made.
- `Toolbar` gets a round badge (`Round 2`). The existing `FeedbackNotesModal`
  becomes a *round summary* derived from reply statuses ("4 applied, 1 declined,
  1 unanswered") rather than a free-text blob.
- **Approval gate:** attempting to approve while `question` replies or group-3
  threads are open shows a warning listing them. Warn, do not block. The
  reviewer is allowed to say "ship it anyway".

**Image mode**

- Markers already carry an ID and geometry. Draw a small status badge on the
  pin/box and put the thread inside the existing comment popover.
- **The number cannot be replaced by the handle.** Image annotation numbers are
  baked into the output image pixels by the render legend, and
  `findNearbyAnnotationNumbers()` (`server/image/common/feedback.js`) is
  index-based. Number and handle have to coexist permanently, and a ghost
  overlay from an earlier round must render its handle, because its old number
  means nothing against a re-numbered current round.
- **Re-capture drift.** When the target is a URL, round 2 is a *new*
  screenshot; old coordinates may point at nothing. v1 renders previous-round
  markers as ghost overlays at their old coordinates, labelled "from round 1,
  page re-captured". No geometric re-location: false precision is worse than a
  visible ghost the reviewer can judge.
- Element-level re-anchoring would need the capture step to record DOM
  metadata (a selector or stable attribute per marked region) alongside the
  screenshot. Captures now carry a DOM map (`server/image/common/domMap.js`)
  that feedback uses to name the element under a mark, but it is not stored
  with the session and nothing re-anchors a mark to an element yet. Draft 1
  deferred this to a `web-annotation.md`; no such document exists in this repo.

### 3.6 Outgoing feedback becomes thread-aware

Replace the `type !== 'NOTES'` filter with a thread formatter. For a thread
that already has replies, emit the whole exchange, so the agent sees a
disagreement instead of an isolated new comment:

```markdown
## 3. Reopened comment on (Line 88) [#7b210e44]

> Original: "This paragraph contradicts the intro."

Agent (declined): the intro was changed in the same round, so there is no
contradiction any more.

Reviewer: the intro still says the opposite. Look at line 12.
```

New annotations print exactly as they do today. The markdown output remains the
primary agent-facing artefact; the session JSON is the machine contract and
carries `schemaVersion`.

### 3.7 Vocabulary

Draft 1 flagged that four notions of "notes" would coexist and deferred the
fix. Deferring it means the docs become unreadable, so here is the resolution:

| Term | Fate |
| ---- | ---- |
| `NOTES` annotation type | Becomes a reply with `author: 'agent'`. It already is one semantically; it just has no status and no thread. |
| `--feedback-notes` flag | Deprecated in favour of the session file. Kept as the shim in 3.4, removed one minor version later. |
| `APPROVED WITH NOTES` stdout line | Unchanged. It is a stdout contract with external consumers and means something different: approved despite annotations. |
| Replies | The only new term. |

Net effect: two concepts (replies, and "approve with notes") instead of four.

## 4. Staged delivery

| Stage | Content | Ships value alone? |
| ----- | ------- | ------------------ |
| S1 **(shipped)** | 8-char handles in both modes' feedback output; a heading format for markdown global comments so they can carry one; `createAnnotationId()` moved to `client/shared/utils/` and adopted by markdown mode; the five agent-facing files in `apps/*` told what a handle is | Yes. Agents can reference marks in chat immediately |
| **S1.5** | **Measure. Run 5 to 10 real reviews and count how often the agent quotes a handle correctly and picks a defensible status** | **No. This is the gate on everything below** |
| S2 **(core shipped for image mode)** | Session file, `annotaitr reply` subcommand, agent replies with status. Still open: markdown inline rendering, anchoring ladder steps 0 to 2 for markdown, orphan group in markdown | Yes |
| S3 **(image mode shipped)** | Human replies flow back out; thread-aware feedback formatter; approval gate. Shipped for image mode: reviewer replies, a "Replies to round N" section after the new marks' feedback, and the approval gate as a warning. Markdown mode is still open | Yes |
| S4 **(image mode shipped)** | Image-mode parity incl. ghost overlays: last round's marks and replies on the canvas, in the panel, on the video timeline and the PDF page strip | Yes |

There is no trailing documentation stage. Draft 1 parked the `apps/*` updates in
S5, which would have left S1 inert: an agent that is never told what
`[#a3f19c2e]` means ignores it, and S1.5 would then measure prompt wording
rather than agent discipline. Each stage updates the agent-facing files it
affects, as part of that stage.

Two changes from draft 1. **S1.5 is new**: draft 1 named agent discipline as
the first risk and said to test it first, but gave it no stage, which in
practice means it gets skipped and S2 gets built on an untested assumption.
**The `annotaitr reply` subcommand moves from S5 into S2**, because 3.4 now
treats it as the only supported write path rather than one of two candidates.

S1 is worth doing whether or not the rest is built.

**Open question for discussion.** S1 plus S3 delivers most of the value as
text: stable handles going out, the full exchange coming back in. S2's inline
rendering is where the bulk of the implementation cost sits. Before committing
to S2, it is worth asking whether the text-only loop is already short enough,
and whether the answer changes once S1.5 has real numbers.

## 5. Risks and honest assessment

- **The design assumes agent discipline.** Everything rests on an agent
  quoting handles correctly and picking a sensible status. S1.5 exists to test
  this with a deliberately terse prompt before S2 is built. If the agent gets
  handles wrong a meaningful fraction of the time, the thread model is
  decoration on top of noise. Mitigation either way: validate handles on load
  and reject unknown ones loudly rather than dropping the reply. The `reply`
  subcommand moves that validation to write time, where the agent can still act
  on the error.
- **Re-anchoring is where this dies quietly.** A thread that silently attaches
  to the wrong paragraph is worse than no thread. Instrument the ladder
  outcomes from day one; prefer "orphan" over a confident wrong match. Ladder
  step 0 is exact; every step below it is a guess and should be labelled as one
  in the UI.
- **Scope creep toward a review tool.** The value proposition is "finish a
  review in fewer passes", not "hold a conversation in the margin". If threads
  routinely run past ~3 replies, that is a signal the reviewer should be talking
  to the agent directly, worth surfacing as a hint rather than accommodating
  with more thread features. The `question` status in 3.2 is the sharpest case
  of this and is deliberately scoped to recording, not asking.
- **Cost concentration.** S2 carries the session file, the subcommand, the
  ladder and the inline UI. It is by far the largest stage and the one most
  likely to be abandoned half-built. If it needs splitting, the natural seam is
  session file plus subcommand plus ladder first (agent-visible, testable
  without UI), inline rendering second.
- **The CLI has no subcommand concept.** Argument parsing is a hand-rolled loop
  where any non-flag token becomes a target (`index.js`, target at line
  152), and `main()` always starts a server. `annotaitr reply` needs top-level
  dispatch ahead of that loop plus a second execution path that never binds a
  port. This is structural work, not a flag addition, and it is the part of S2
  most likely to be underestimated. The `--session` family of flags, by
  contrast, drops into the existing loop. There is also no persistence path in
  the codebase today: the only writes are write-once temp artifacts that are
  never read back (`server/image/still/output.js`, `server/image/still/clipboard.js`),
  so the session file is a new module including discovery, staleness and
  cleanup.

## 6. Changes from draft 1

1. Handles widened from 6 to 8 hex characters, defined as the first UUID
   group, and the session-wide collision check dropped as unimplementable
   without centralising ID minting (3.1).
2. Added the `crypto.randomUUID` secure-context prerequisite for markdown mode
   (3.1).
3. Every status now requires `text`; draft 1 exempted `applied` and `deferred`
   (3.2).
4. Scoped `question` to recording rather than asking, with the round-trip cost
   spelled out (3.2).
5. Added ladder step 0 (content hash identical → exact re-attach) and an
   explicit warning that `blockId` is a parse-time counter and unusable as an
   anchor (3.3).
6. Specified session file discovery, staleness, cleanup and schema-mismatch
   behaviour, all open in draft 1 (3.4).
7. Resolved the `annotaitr reply` open question in favour of building it, and
   moved it from S5 to S2 (3.4, 4).
8. Added annotation panel group 3, "carried over with no reply" (3.5).
9. Replaced the dangling `web-annotation.md` reference with an inline statement
   of the DOM-metadata dependency; no such file exists in this repo (3.5).
10. Added 3.7 resolving the "notes" vocabulary collision that draft 1 only
    flagged.
11. Added stage S1.5 as an explicit measurement gate (4).

After a pass over the actual change surface, four further corrections:

12. Markdown global comments have no heading and cannot carry a handle as the
    output stands. Folded the fix into S1 (3.1, 4).
13. Image annotation numbers are baked into the rendered image, so number and
    handle must coexist and ghost overlays must show handles (3.5).
14. Ladder step 0 is cheaper than assumed: a `contentHash` and a `hashMismatch`
    flag already ship in markdown mode. Image mode has neither (3.3).
15. `annotaitr reply` is structural, not additive: the CLI has no subcommand
    dispatch and no persistence path at all (5).
16. Handles are no longer written into the JSON export: `id` is already there
    and the handle derives from it, so persisting it would duplicate derived
    state and break image mode's round-trip identity (3.1).
17. Image mode places the handle after the number rather than at the end of the
    heading, because a proximity note would otherwise separate the handle from
    the number that is baked into the image (3.5).
18. Agent-facing files in `apps/*` are updated per stage instead of in a
    trailing S5. None of the five mentioned handles, which would have made S1
    inert and S1.5 meaningless (4).
