# How it works

Every review follows the same loop: the CLI opens a target in the browser and blocks, a person marks it up, and the markup becomes feedback text the agent can act on without coordinates or line numbers typed by hand.

```text
agent runs annotaitr <target>  →  browser opens  →  you mark it up and decide
        ↑                                                      ↓
agent applies the feedback  ←  decision printed to stdout  ←  submit
```

| Mode | Targets | The agent receives |
|------|---------|--------------------|
| Image | image, captured URL, clipboard, video, GIF, PDF | numbered notes with position, plus the annotated image |
| Markdown | Markdown, plain text, config and data files | one block per note with line reference and requested change |

Every note has a number it keeps for the whole round and one of four intents: Change, Add, Remove, Question.

## Image mode

Draw a box, arrow, freehand or highlighter mark, or drop a numbered pin, each with an optional comment. An arrow can switch to a dimension-line style (ticks instead of an arrowhead) to mark distance or spacing.

On submit:

- The marks are baked into a copy of the image, each number on its intent's colour, with a legend such as `3. Question · Pin`. The copy is written to a fresh temp file and its path goes to the agent.
- The feedback lists each note with a plain-language position (for example "top right, ~15% from top") and flags notes placed too close for that label to tell them apart.

### Captured pages

The capture also records a map of the page's visible elements (box, tag, role, accessible name, media file, short selector), measured in the same pixel space as the screenshot. Fixed-position elements are left out because a full-page screenshot moves them.

- **Matching**: a pin or arrow tip matches the smallest element under it, a box or freehand mark the element it overlaps most. Landmarks and plain panels only count when nothing more specific is near, and an unnamed panel is named after its first heading, such as `div (heading "Pricing")`.
- **Output**: each note gets an `Element:` line, for example `Element: img "Team photo" ("team.jpg") · #hero img`. Page text is capped, quoted and labelled as page content.
- **While annotating**: the **Element** tool outlines the element under the pointer like a DevTools inspector, and a click selects it as its own annotation (`Selected element`). For other tools, the comment box and sidebar name the matched element. The client fetches the map from `/api/elements` and runs a copy of the matching that a test keeps identical to the server's.
- **Fallback**: if collecting the map fails, the capture still works and the feedback has no element lines. Local images, clipboard images and recordings have no DOM, so their output is unchanged.

**Capture again**: the viewport button reruns the capture with a new viewport, section or delay and swaps the screenshot and element map in the open tab while the CLI keeps waiting. A section captures only the visible viewport, so fixed headers appear where the reviewer sees them. Annotations are discarded, because their coordinates belong to the old layout.

### Videos and GIFs

A recording is image mode on a timeline. The server never decodes it: it streams the file with range requests and the browser plays it. Each note has a `time` (a span also an `endTime`), and geometry is in the video's own pixels.

On submit the browser asks the server which frames are needed (`POST /api/frame-plan`), seeks a hidden player to each time and uploads the frames as PNGs (`PUT /api/frames`). The server bakes the marks into them, lays out a strip per span and an overview, and prints feedback in time order that points at those files. Agents read images, not video, so the frames are the deliverable.

### PDFs

A PDF is image mode on a list of pages.

- **Rendering**: pdf.js runs in a worker thread, so a slow or hostile page never stalls the server. Every render has a timeout, after which the worker is replaced. Pages render on first request at 2000 px on the longer side, which is also the space annotation geometry lives in.
- **Position memory**: `/api/meta` carries a content hash, and the client remembers the page shown for it in a cookie. A reload returns to that page, a regenerated PDF starts at the first.
- **Output**: feedback is grouped by page, general comments last, and numbers run across the whole document. Each annotated page is baked into its own image and laid out in an overview. With `--source`, the feedback names the file to edit and warns when it is newer than the PDF.
- **Text layer**: the worker reports every text run and link, and the server merges them into lines and blocks. A block with a clearly larger font is a heading. The result feeds the same element matcher as a captured page, and the feedback quotes the matched text as untrusted content.
- **Text selection**: the Text tool snaps to words, selects everything between the two words you dragged across, and the feedback prints it as a `Quote:` line.

### Copying and saving

The More actions menu (⋮) copies or saves the annotated image as the agent gets it, and copies the feedback as Markdown without the temp-file path. Neither decides anything: the CLI keeps waiting. Recordings offer only the JSON export, since they have no single image.

## Markdown mode

Select text to see the selection bar:

| Action | Key | Effect |
|--------|-----|--------|
| Change | `1` | highlight text and request a change |
| Add | `2` | insert new text after the selection |
| Remove | `3` | mark text as struck through |
| Ask | `4` | highlight text and ask a question |
| Quick label | `Alt+1` to `Alt+0` | categorize a selection instantly |
| Insert | `Alt+click` | place the cursor to add text there |
| Global comment | | general feedback not tied to a selection |

Images, Mermaid, PlantUML and Kroki diagrams can be commented on or marked for deletion like text.

On submit, each note becomes a Markdown block headed by its number and intent and naming the lines, such as `## 3. Question · Text (Line 7)`. A multi-file session groups blocks by file and numbers across all files.

### Changes walkthrough

`annotaitr changes` is Markdown mode on a document it writes itself (see [the guide](usage/markdown.md#presenting-changes-before-a-commit)).

- **Source**: the hunks always come from git, the agent's `--explain` file only adds text around them. git runs without a shell and with external diffs, textconv and fsmonitor switched off. Size limits are checked before a diff is read, so a huge file is listed with its counts instead of being loaded.
- **Document**: the walkthrough is written to `changes.md` in the git directory, never committed, and deleted after the decision. The client lays it out as an overview, a file tree and one card per file. `Whole file` asks `/api/changes/full` for the diff of that one file with all of it as context.
- **Output**: a note on a diff line is mapped back to the file and to its `new` or `old` line, such as `## 1. Change · Text (new Lines 43-49 in src/Foo.php)`.
- **At the decision**: the CLI takes a cheap fingerprint of the changes again, without reading a diff. If it moved while the review was open, the output starts with `CHANGED DURING REVIEW:`, so the agent knows the notes may point at code that changed since.

## Decisions

The decision dialog offers two approvals. **Approve** discards the notes after one confirmation. **Approve with notes** accepts the target as-is and passes the notes along as context, not as change requests.

## The review loop

The CLI blocks until a decision is made, prints it to stdout and exits (see [exit codes](usage.md#output-and-exit-codes)). The agent applies the changes and reopens the annotator on the same target. Markdown mode's `--feedback-notes` shows what changed since the last submission.

A tab that stops answering its heartbeat resolves the decision as disconnected instead of hanging the CLI. `Ctrl+C` resolves it as aborted, never as an implicit approval.

### Handles and numbers

- **Handle**: each note carries a short handle such as `[#a3f19c2e]`, the first group of its UUID. It stays fixed for as long as the note exists, including across a JSON export and re-import or a restored draft. The annotator does not display it, so agents pair each handle with a few words naming the passage when they report back.
- **Number**: stored with the note when it is made. Deleting a note never renumbers the others, and the same number shows on the canvas, the card, the rendered image and in the output. A new round starts at 1. Data saved before numbers and intents existed gets them on load.

### Sessions and replies

Image mode keeps a session across rounds. Each decision with marks is written to a session file, and the feedback ends with a `Session:` line. The agent answers each handle with `annotaitr reply --status ...` (see [review sessions](usage/sessions.md)).

- Reopening the same image, URL, video or PDF within 24 hours starts the next round. A clipboard image has no identity to find and continues only with `--session <id>`.
- The next round shows the previous marks and the agent's replies in a layer that a "Previous round" toggle hides. The reviewer can answer a thread there, and the reply travels with the next decision.
- The feedback lists new marks first, then a "Replies to round N" section. Answered threads continue on the same handle.
- Approving while the agent's questions are unanswered asks for confirmation first.
- Marks whose position no longer matches, for example after a re-capture, are drawn as ghosts.

Markdown mode has no sessions yet. The design is in [the inline replies concept](concepts/inline-agent-replies.md).

## See also

[The `annotaitr` CLI](usage.md): flags, environment variables and the mode-detection rules.
