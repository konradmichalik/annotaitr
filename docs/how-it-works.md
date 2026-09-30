# How it works

Both modes follow the same shape: open a target in the browser, let a human
mark it up, and turn the markup into feedback text an agent can act on
directly, without the human writing out coordinates or line numbers by hand.

## Image mode

Click and drag to draw a box, arrow, freehand mark, or highlighter mark, or
click to drop a numbered comment pin; add an optional comment to each. An
arrow can also be switched to a dimension-line style (perpendicular ticks
instead of an arrowhead) for marking distance or spacing between two points.

On submit, the annotations are baked into a copy of the image (with a
numbered legend) and written to a fresh temp file. The feedback text sent to
the agent lists, per annotation, a plain-language position (e.g. "top
right, ~15% from top") derived from the annotation's bounding point as a
percentage of image width/height, and calls out other annotations
positioned close enough that the coarse label alone might not tell them
apart. The path to the annotated screenshot is included, so the agent reads
the image directly instead of relying on the text description alone.

Approving with annotations present becomes **Approve with Notes**: the
target is accepted as-is, but the notes are passed along as context rather
than discarded.

## Markdown mode

Once a file is open in the browser:

- **Select text** to see the annotation toolbar
- **Delete** marks text as struck-through
- **Comment** highlights text and adds a comment
- **Quick Label** (`Alt+1`-`0`) categorizes a selection instantly
- **Insert** places the cursor to add new text at that position
- **Global Comment** adds general feedback not tied to a selection
- Images, Mermaid, PlantUML and Kroki diagrams can be commented on or
  marked for deletion the same way as text

On submit, each annotation is formatted as a Markdown block naming the
affected line(s) and the requested change (remove / comment / insert); a
multi-file session groups blocks by file. As in image mode, approving with
annotations present becomes **Approve with Notes** instead of discarding
them.

## The review loop

Both modes block the CLI process until a decision is made in the browser,
then print that decision to stdout and exit: see [exit
codes](usage.md#output-and-exit-codes). An agent applies the requested
changes and re-opens the annotator on the same target to confirm the fix and
collect further feedback; markdown mode's `--feedback-notes` lets that
re-opened round show what changed since the last submission, so the reviewer
isn't looking at a blank slate.

Every annotation carries a short handle in the feedback output, written as
`[#a3f19c2e]`. It is the first group of the annotation's internal UUID, so it
stays fixed for as long as the annotation exists, including across a JSON
export and re-import or a restored draft. The numbering is positional and is
recomputed on every export. The handle gives an agent something unambiguous to
quote back, as in "fixed `#a3f19c2e` (the intro), left `#7b210e44` alone
because …". The annotator does not display handles, so agents are told to pair
each one with a few words naming the passage. Annotations are not carried into
a round in which the document has changed, so today a handle identifies a mark
within one round and in the agent's report on it. Linking a mark to the agent's
reply in the next round is the subject of
[the inline replies concept](concepts/inline-agent-replies.md).

A heartbeat request from the browser tab, polled every few seconds, detects
a closed tab and resolves the decision as disconnected rather than hanging
the CLI forever. Interrupting the process (`Ctrl+C`) resolves it as
aborted, never as an implicit approval.

## See also

- [The `annotaitr` CLI](usage.md): flags, environment variables, and the
  mode-detection rules referenced above
