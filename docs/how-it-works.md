# How it works

Both modes follow the same shape: open a target in the browser, let a human
mark it up, and turn the markup into feedback text an agent can act on
directly, without the human writing out coordinates or line numbers by hand.

## Image mode

Click and drag to draw a box, arrow, freehand mark, or highlighter mark, or
click to drop a numbered comment pin; add an optional comment to each. An
arrow can also be switched to a dimension-line style (perpendicular ticks
instead of an arrowhead) for marking distance or spacing between two points.

Every note carries an intent (Change, Add, Remove, Question) and a number it
keeps for the whole round. On submit, the annotations are baked into a copy of
the image, each number on its intent's colour, with a legend such as
`3. Question · Pin`, and written to a fresh temp file. The feedback text sent to
the agent lists, per annotation, a plain-language position (e.g. "top
right, ~15% from top") derived from the annotation's bounding point as a
percentage of image width/height, and calls out other annotations
positioned close enough that the coarse label alone might not tell them
apart. The path to the annotated screenshot is included, so the agent reads
the image directly instead of relying on the text description alone.

For a captured URL, the capture also records a map of the page's visible
elements (box, tag, role, name from aria-label, alt, title or text, media
file name, short selector), measured right after the screenshot in the same
pixel space. Fixed-position elements are left out, because a full-page
screenshot moves them away from where they measure. On submit, each mark is
matched to the smallest element under a pin or arrow tip, or to the element
a box, freehand or highlighter mark overlaps most. Landmarks such as `main`
or `nav` and plain panel divs (a readable class or id, larger than 40 px)
only count when nothing more specific is under or near the mark, so an
empty spot in a card names the card rather than the page. An unnamed
landmark or panel is named after its first visible heading, such as
`div (heading "Pricing")`. The feedback gets an
`Element:` line such as `Element: img "Team photo" ("team.jpg") · #hero img`.
While annotating, the same match is visible before anything is submitted.
The **Element** tool, offered only for a captured URL, outlines and names
the element under the pointer like a DevTools inspector; a click selects
that element as its own annotation, drawn as a tinted outline that stays on
the element and reported as a `Selected element`. For every other tool, the
comment box and the sidebar name the element each mark is matched to. The client fetches the map from
`/api/elements` and runs its own copy of the matching, which a test keeps
identical to the server's. Page text is capped and quoted, and the output
labels it as page content. If collecting the map fails, the capture
still works and the feedback simply has no element lines. Local images,
clipboard images and recordings have no DOM, so their output is unchanged.

**Approve with notes**, from the decision dialog, accepts the target as-is
and passes the notes along as context. **Approve** discards them after one
confirmation.

### Copying and saving

The More actions menu (⋮) in the sidebar header copies the annotated image (markup and
legend baked in, as the agent gets it) to the clipboard or saves it as a
PNG, and copies the feedback as Markdown, without the temp-file path that
only means something to an agent. Both are rendered from the annotations
on screen at that moment and decide nothing: the CLI keeps waiting. The same
menu still opens the JSON export and import. Recordings offer only the JSON
export, since they have no single image.

### Capturing again

For a URL, the viewport button next to the zoom controls captures the page
again in place: the server reruns the capture with the new viewport,
section and delay, swaps the screenshot and its element map, and the open
tab reloads them, while the CLI keeps waiting for the decision. A section
captures only the visible viewport, at the top of the page or scrolled to
an anchor or offset, so
fixed headers appear where the reviewer sees them and are kept in the
element map. Annotations are discarded on a new capture, because their
coordinates belong to the old layout.

### Videos and GIFs

A video or GIF is image mode on a timeline. The server never decodes it: it
streams the file with range requests, and the browser plays it (a GIF is
decoded in the browser and composited onto a canvas). Every annotation
carries a `time`, a span also an `endTime`, and the geometry is in the
video's own pixels, so the position wording works as for a still image.
The feedback lists annotations in time order, general comments last, each
under the number it got when it was made.

On submit the browser asks the server which frames the output needs
(`POST /api/frame-plan`), seeks a hidden copy of the player to each time,
grabs the frame as a PNG and uploads it (`PUT /api/frames`). The server then
bakes each moment's annotations into its frame, lays out a strip per span
and an overview of the whole recording, and prints feedback that points at
those files. Agents read images, not video, so the frames are the
deliverable.

### PDFs

A PDF is image mode on a list of pages. The server parses it with pdf.js in
a worker thread, so a slow or hostile page never stalls the server: every
render has a timeout, after which the worker is replaced. `/api/meta` lists
the pages with their size in rendered pixels (longer side 2000px), which is
also the space annotation geometry lives in. Pages and thumbnails are
rendered on first request, thumbnails at their own small size, and only a
few full pages are kept in memory. `/api/meta` also carries a hash of the
PDF's content: the client remembers the page shown for that hash in a
cookie, so a reload (or reopening the same PDF) returns to it, while a
regenerated PDF starts on its first page.

Every annotation carries a `page`, a page comment is a comment with a
`page`, a general comment has none. The feedback lists annotations by page,
general comments last, each under the number it got when it was made, so the
numbers run across the whole document but need not ascend. On submit
the server bakes each annotated page's marks into its own image, lays the
annotated pages out in an overview and prints feedback grouped by page. With
`--source`, the feedback names the file the agent edits and warns when that
file is newer than the PDF.

The text layer stands in for the DOM map of a captured page. The worker
reports every text run with its position and font size and every link
annotation; the server merges runs into lines and lines into blocks (same
column, no paragraph gap, similar font size), calls a block a heading when
its font is clearly larger than the page's body text, and serves the result
per page in the shape the shared element matcher already consumes. The
feedback quotes the matched text as untrusted document content.

A text selection snaps to the page's words. The worker splits every text run
into words, measuring each word's share of the run in a generic sans serif,
and the server lists them in reading order (block by block, line by line).
The Text tool selects every word between the two it was dragged across and
stores one rectangle per line plus the selected words as `quote`, which the
feedback prints as a `Quote:` line.

## Markdown mode

Once a file is open in the browser:

- **Select text** to see the selection bar
- **Change** (`1`) and **Ask** (`4`) highlight text and add a comment with that intent
- **Add** (`2`) inserts new text after the selection
- **Remove** (`3`) marks text as struck-through
- **Quick Label** (`Alt+1`-`0`) categorizes a selection instantly
- **Alt+click** places the cursor to add new text at that position
- **Global Comment** adds general feedback not tied to a selection
- Images, Mermaid, PlantUML and Kroki diagrams can be commented on or
  marked for deletion the same way as text

On submit, each annotation is formatted as a Markdown block headed by its
number and intent and naming the affected line(s), such as
`## 3. Question · Text (Line 7)`; a multi-file session groups blocks by file
and numbers across all files. As in image mode, the decision
dialog offers **Approve with notes** to pass the notes along as context.

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
export and re-import or a restored draft. Its number is stable for the round
too: it is stored with the note when the note is made, deleting a note never
renumbers the others (the gap stays), and the same number shows on the
canvas, the card, the rendered image and in the output. A new round starts at
1 again. Data from before numbers and intents were stored (a JSON export, a
draft, a session file) gets them on load: the number in the order that
version used, the intent from the note's type. The handle gives an agent something unambiguous to
quote back, as in "fixed `#a3f19c2e` (the intro), left `#7b210e44` alone
because …". The annotator does not display handles, so agents are told to pair
each one with a few words naming the passage. Annotations are not carried into
a round in which the document has changed, so today a handle identifies a mark
within one round and in the agent's report on it. Linking a mark to the agent's
reply in the next round is the subject of
[the inline replies concept](concepts/inline-agent-replies.md).

Image mode already does this. Each decision with marks is written to a session
file, and the feedback ends with a `Session:` line. The agent answers each
handle with `annotaitr reply --status ...` (see [review
sessions](usage.md#review-sessions)). Reopening the same image file, URL, video
or PDF within 24 hours starts the next round, while a clipboard image has no
identity to be found by and continues only with `--session <id>`. The next round
shows the previous round's marks, with the agent's
replies, in a separate layer that a "Previous round" toggle hides. The reviewer
can answer a thread there with a reply that travels with the next decision. The
feedback lists the new marks first, then a "Replies to round N" section with
each exchange, and threads that were answered continue on the same handle. An
approval while the agent's questions are unanswered asks for confirmation
first. Marks whose
position no longer matches, for example after a page was re-captured, are drawn
as ghosts. Markdown mode has no sessions yet.

A heartbeat request from the browser tab, polled every few seconds, detects
a closed tab and resolves the decision as disconnected rather than hanging
the CLI forever. Interrupting the process (`Ctrl+C`) resolves it as
aborted, never as an implicit approval.

## See also

- [The `annotaitr` CLI](usage.md): flags, environment variables, and the
  mode-detection rules referenced above
