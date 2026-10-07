# The `annotaitr` CLI

```bash
annotaitr [options] [target ...]
```

Prose introducing the shape: `annotaitr` is one binary for two review modes.
Which mode runs is auto-detected from `target`; every flag below is
mode-specific except `--help`, `--origin` and `--as`.

## Mode detection

| Target | Mode |
|--------|------|
| No target, on macOS with an image on the clipboard | Image (clipboard) |
| No target, otherwise | Prints help and exits `0` |
| A Claude Code chat image chip (a target starting with `[Image`) | Prints a `PASTED CHAT IMAGE:` hint for the agent and exits `0` |
| One or more existing files, all markdown/plain-text | Markdown |
| A single `http(s)` URL | Image (capture) |
| A single existing file with a supported image extension (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`) | Image (local file) |
| A single existing video or GIF (`.mp4`, `.m4v`, `.webm`, `.mov`, `.gif`) | Image (video, on a timeline) |
| A single existing PDF | Image (document, page by page) |
| A single existing `.pptx`, `.ppt`, `.odp`, `.key`, `.docx`, `.doc`, `.odt`, `.rtf` or `.pages` | Prints a `CONVERT TO PDF FIRST:` hint and exits `0` |
| Anything else | Exits `1` naming the supported extensions and suggesting `--as` |

```bash
annotaitr README.md docs/guide.md    # markdown: multiple files, tab bar
annotaitr ./mockup.png               # image: local file
annotaitr http://localhost:3000      # image: capture
annotaitr                            # image: clipboard (macOS), or help
annotaitr ./diagram.svg              # image: SVG, rasterized to PNG
annotaitr ./bug-recording.mov        # image: video on a timeline
annotaitr ./deck.pdf --source ./deck.pptx   # image: PDF, page by page
annotaitr --as image ./mockup.png    # skip detection, force a mode
```

## `--as`

Forces `image` or `markdown`, skipping detection entirely. The target still
needs an extension the forced mode supports.

```bash
annotaitr --as image ./mockup.png
```

## Web page capture

A URL target is captured with playwright's Chromium. The `playwright`
package comes with the install, its browser build does not, and the first
capture fails with the install command until it is there:

```bash
npx playwright install chromium
```

Each playwright release expects its own Chromium revision. Outside a
project, `npx` fetches the latest playwright, so the error and the installer
script (which checks for the build) name the exact version instead, e.g.
`npx playwright@1.63.0 install chromium`. Local images,
videos, GIFs and PDFs need no browser build.

## SVG files

An `.svg` target is rendered to a PNG before the annotator opens, so it is
annotated like any other image. The renderer runs no scripts and loads no
external resources. The longer side is rendered at the declared size, but at
least 1600px and at most 8000px: icons are scaled up, oversized drawings
scaled down, both as vectors without loss. Transparent areas get a white
background. The SVG needs a `width`/`height` in px (or unitless) or a
`viewBox`, otherwise it has no size to render at and is rejected.

## Videos and GIFs

A video or GIF opens with a player docked below the canvas. Pause on a
frame and draw on it with the usual tools: each annotation is pinned to the
frame it was drawn on. For something that lasts, click **Mark span** (`I`)
at its start, move to its end and click **Set end here** (`O`). Then pick a
tool (or click **Pin** next to the span) and click the start frame, or use
**Comment span** to comment without drawing. The comment box shows what the
new annotation is pinned to, `At 00:01.000` or `Span 00:01.000 → 00:03.000`.

| Key | Action |
|-----|--------|
| `Space` | Play or pause |
| `←` / `→` | One frame back or forward |
| `Shift` + `←` / `→` | One second back or forward |
| `I` / `O` | Mark span / Set end here |
| `M` | Sound on or off |
| `Alt` + `←` / `→` on a focused marker | Move it one frame, with `Shift` its end (a moment becomes a span) |

Each annotation shows as a marker above the scrubber: a numbered dot for a
moment, a bar with the tool icon (or a speech bubble for a text-only span)
and the start of the comment for a span. Click a marker to jump
to it, drag it to move the annotation to another time, and drag a span's
edge to lengthen or shorten it. A moment becomes a span by dragging the
handle that appears to the right of its marker. Every change can be undone.

Sound starts muted. The speaker button next to the speed (or `M`) turns it
on, and hovering it shows the volume slider; the setting is remembered. The
agent gets no sound, only the frames.

The browser plays the file and grabs the frames itself, so only
`@napi-rs/canvas` is needed, not playwright. Which codecs play depends on
the browser: an HEVC `.mov` does not play everywhere. The annotator then
shows the conversion command:

```bash
ffmpeg -i input.mov -c:v libx264 -pix_fmt yuv420p output.mp4
```

Agents cannot watch video, so the feedback points at still images in a temp
directory:

- one PNG per annotated moment, with the markup and a legend baked in
- a strip of six frames across every span
- `overview.png`, twelve frames spread over the whole recording with the
  annotation numbers on the nearest frame

Videos are limited to 500 MB and GIFs to 50 MB and 2000 frames. One
submission exports at most 50 distinct frames.

## PDFs

A PDF opens with a strip of page thumbnails on the left and previous/next
buttons next to the zoom controls. Draw on the page shown with the usual
tools: each annotation belongs to its page. A page shows a placeholder while
it is rendered, and the next page is rendered ahead in the background. The
button next to **Add general comment** adds a comment about the page shown
without drawing, for notes like "this slide is too dense".

| Key | Action |
|-----|--------|
| `PageDown` / `]` | Next page |
| `PageUp` / `[` | Previous page |
| `Home` / `End` | First / last page |

Pages are rendered on this machine with pdf.js (the optional dependency
`pdfjs-dist`, plus `@napi-rs/canvas`), in a worker thread: a page that takes
longer than 10 seconds is given up and shows an error instead of blocking
the review. The longer side of a page is rendered at 2000px. Encrypted PDFs
are rejected, export an unprotected copy. A PDF is limited to 200 MB and a
review to 200 pages, `--pages` picks a part of a longer one.

The feedback is grouped by page, numbered across the whole document, and
points at one image per annotated page (markup and legend baked in) plus
`overview.png` with the annotated pages side by side. Untouched pages are
not written.

The PDF's text layer works like the element map of a captured web page:
hovering with the **Element** tool outlines a text block, heading or link,
clicking selects it, and the feedback names the text under every mark, e.g.
`Text: heading "Revenue by region"`. Text blocks are rebuilt from where the
text sits on the page, since a PDF has no DOM. A scanned PDF has no text
layer, so it gets no `Text:` lines and no Element or Text tool.

The **Text** tool selects text like a browser does: drag from the first to
the last word you mean, across lines if needed, and the selection snaps to
whole words. The comment box and the sidebar show the selected words, and
the feedback quotes them exactly, e.g. `Quote: "North grew 12%"`, so the
agent can find the passage in the source. Word positions are measured
approximately, since a PDF only stores where a run of text starts and how
wide it is.

Office formats are not converted. `annotaitr deck.pptx` prints a
`CONVERT TO PDF FIRST:` hint with the command to run once the PDF exists,
and exits `0` so a slash command passes it on to the agent. Export the PDF
with the tool that created the document (PowerPoint, Keynote, LibreOffice,
Marp, Slidev).

## `--source`

PDF only. The file the PDF was rendered from: a `.pptx`, a Keynote package,
a Marp `deck.md` or a Slidev project directory. The feedback names it, so
the agent edits the source and not the PDF. If the source was changed after
the PDF, annotaitr warns in the terminal, in the annotator and in the
feedback that the PDF may be outdated. For a directory, the newest file
inside counts, ignoring `node_modules`, `.git`, dot directories, `dist` and
`build`.

```bash
annotaitr ./deck.pdf --source ./deck.pptx
```

## `--pages`

PDF only. Reviews only these pages: single pages and ranges separated by
commas, an open range runs to the last page. Page numbers in the feedback
stay the document's own.

```bash
annotaitr --pages 1-5,8,12- ./report.pdf
```

## Voice notes

With [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and ffmpeg
installed, the comment box of image mode (stills and recordings) gets a
microphone button: speak the comment instead of typing it, and the
transcript lands in the text field to correct before saving. The recording
is transcribed on this machine and deleted right after; nothing is sent
anywhere.

```bash
brew install whisper.cpp ffmpeg
# a model, e.g. the multilingual "small" one (~470 MB)
curl -L -o ~/.cache/ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
export ANNOTAITR_WHISPER_MODEL=~/.cache/ggml-small.bin
```

Without a model, `whisper-cli` or ffmpeg the button is simply not shown.

## `--origin`

Identifies the caller in the feedback output and in the annotator header,
which says who is waiting for the decision ("Claude Code is waiting",
"Terminal is waiting"). One of `cli` (default), `claude-code`, `opencode`,
`vibe`. Set
automatically by the Claude Code, OpenCode and Vibe integrations; a plain
terminal invocation never needs it.

## `--viewport`

Image mode only, and only meaningful when the target is a URL. A local
image, video, GIF or PDF rejects it. A preset
(the default `desktop`, or `laptop`, `tablet`, `mobile`) or an explicit
`<width>x<height>`.

```bash
annotaitr --viewport mobile http://localhost:3000/checkout
annotaitr --viewport 1024x768 http://localhost:3000
```

The viewport can also be changed after the page opened: the button next
to the zoom controls (e.g. `Desktop 1920×1080`) picks a preset or a custom
size, a section and a delay, and captures the page again in the same tab.
Tablet and Phone can be turned to landscape, which the feedback names as
`tablet landscape (1024×768)`; `--viewport 1024x768` captures the same
from the start.
A section captures only the visible viewport instead of the full page:
the first screen at the top, or scrolled to an anchor (`#pricing`) or a
pixel offset. Capturing again
discards the annotations made so far, after a confirmation. For a URL
target, the feedback names the capture it refers to, e.g.
`Captured at tablet (768×1024), section #pricing, after 500 ms`.

## `--delay`

Image mode only, URL targets only. Waits this many milliseconds (0 to
10000) after the page has loaded before capturing, so animations,
carousels and lazy content can settle. A local image, video, GIF, PDF or
Markdown target rejects it.

```bash
annotaitr --delay 1500 http://localhost:3000
```

## `--feedback-notes`

Markdown mode only. Attaches read-only AI notes to the first file, so a
re-opened review round shows what changed since the last submission instead
of a blank slate. A JSON array of `{text, line?}` objects, inline or as a
file path; `line` is the line number in the file being opened, omitted for a
general note.

```bash
annotaitr --feedback-notes '[{"text":"Rewrote intro","line":5}]' README.md
annotaitr --feedback-notes notes.json README.md
```

<details>
<summary>Same option via the ANNOTAITR_FEEDBACK_NOTES environment variable</summary>

```bash
ANNOTAITR_FEEDBACK_NOTES='[{"text":"Rewrote intro","line":5}]' annotaitr README.md
```

</details>

## Review sessions

Image mode remembers each review round in a session, so an agent can answer
every mark and the next round can show those answers. Every decision with at
least one mark ends with a line naming the session:

```
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

Opening the same image file, URL, video or PDF again within 24 hours
continues its session and starts the next round; a line on stderr says so.
`--new-session` starts over, `--session <id>` continues a specific session,
which is the only way to continue one for a clipboard image. `--session` and
`--new-session` apply to image mode only.

Sessions are JSON files in `<tmpdir>/annotaitr-sessions` (or
`ANNOTAITR_SESSION_DIR`), readable by the current user only, and deleted
after 7 days. They hold the review comments, so a session is only written
into a folder owned by the current user and closed to others (`chmod 700`);
an existing `ANNOTAITR_SESSION_DIR` must meet that too. If a session cannot be
saved, a warning goes to stderr and the decision is printed as usual. Several
`reply` calls may run at the same time, each waits for the others.

### Replying to the agent

In round 2 the reviewer can answer a thread from the previous round in the
annotator. Opening a thread, from its badge on the canvas or from the "Round 1
replies" section under the panel's **Replies** tab, shows a "Reply to the agent" field. **Reply**, or Ctrl/Cmd+Enter,
stores the reply as "Pending, sent with your decision". It can be removed
until the decision is submitted. The panel shows the reviewer's reply as
"You: ..." and counts them as "· N to send", and a thread with a pending reply
carries a ↩ mark on its canvas badge. A decision may carry only replies and no
new marks, so the main button reads Send feedback with replies alone.

While the agent's questions are unanswered, the main button (Approve or Send
feedback) opens the decision dialog first, with that option selected and the
open questions listed ("The agent asked N questions you have not answered"),
with an Answer button. It never blocks the decision. A round with only replies sent as feedback starts with
`Feedback: 1 reply to round 1, no new marks.`, or
`APPROVED WITH NOTES: 1 reply to round 1. ...` when the target is approved.

The agent sees the exchange under "Replies to round N", after the feedback for
any new marks and before the `Session:` line:

```
## Replies to round 1

### [#b7210e44] Question · Comment pin: bottom (~80% from top, ~50% from left)
> Round 1, mark 2: Button-Farbe passt nicht zur CI
Agent (question): Soll es das CI-Grün #2e7d32 sein oder das Blau aus dem Header?
Reviewer: CI-Grün #2e7d32
```

Answered threads continue into the next round on the same handle, so
`annotaitr reply --to <handle>` works on them. All other threads end with the
decision.

## Tools and the feedback panel

The tools float in a dock at the bottom of the work area, zoom and page
navigation at its top right, the capture control of a web page at its top
left. A mode offers only the tools that work in it. The arrow keys move along
the dock, and each tool has a letter. The letters are ignored while typing and
with a modifier held:

| Key | Image, PDF, web page, video | Markdown |
| --- | --- | --- |
| `V` | Select | Select text |
| `E` | Element (captured web pages, PDFs with text) | |
| `T` | Text (PDFs with text) | |
| `R` | Box | |
| `A` | Arrow | |
| `P` | Freehand | |
| `H` | Highlighter | |
| `C` | Pin | Pinpoint |
| `Esc` | Back to Select | |
| `G` | General comment | General comment |
| `?` | Shortcut list | Shortcut list |

`?` opens the full, searchable list of the open mode's keys in Settings,
under **Shortcuts**; the keyboard button in the header does the same. The
status bar names what the active tool does and its keys (unless **Tool hints**
is off). The feedback
panel lists one card per note: its number on the intent's colour, the intent
as icon and word, the location with the kind of mark (`Page 1 · Box`), then
the quote and the comment. The number is the one the agent reads in the output
and the one on the mark.
Selecting a mark selects its card and the other way round. With an earlier
round the panel switches between **This round** and **Replies**; with several
markdown files between **This file** and **All files**. The general comment is
the row at the bottom of the panel.

### Writing a note

A new mark or text selection opens the comment box with its text field
focused. Ctrl/Cmd+Enter or **Add** saves the note, `Esc` or **Cancel**
discards it. A click outside keeps a box that holds a draft (typed text, a
changed intent, or in image mode a changed ink or stroke) open, so a stray click never loses it; an
untouched box closes, and a mark that was just drawn goes with it. The footer
starts with the [intent](#intents-and-numbers) chip. In image mode the palette
button next to it holds the ink colour, line width, line style and arrow end. In markdown mode `@` suggests files to reference and
the expand button opens a larger editor, which `Esc` collapses again.

Selecting text in markdown mode shows a bar with **Change** (`1` or
Ctrl/Cmd+K), **Add** (`2`, inserts text after the selection), **Remove** (`3`
or Ctrl/Cmd+D), **Ask** (`4`, a comment with the intent Question), **Label**
(Alt+1 to 0) and, on a link, **Open**. Any other key starts a comment with
the [default intent](#settings) and that key. **Add** is offered on text selections only; Alt+click still
inserts text at any position. The arrow keys move between the bar's buttons.

### Intents and numbers

Every note says what the agent should do with it. The intent is shown as an
icon and a word on the card, in the composer and in the output, and the mark
takes its colour:

| Intent | Meaning for the agent | Default for |
| --- | --- | --- |
| Change | Apply the comment to what the note points at | Shapes, text selections, comments on a page or a time, markdown comments (unless **Default intent** in the settings names another) |
| Add | Add something there; a markdown insertion carries the text | Markdown insertions |
| Remove | Remove what the note points at | Markdown deletions |
| Question | The reviewer asks, no edit is requested | Pins |

The composer's footer starts with the intent chip (`✎ Change ▾`), which opens
a menu of the four. The keys `1` to `4` switch it while focus is in the
composer but not in its text field, for example after `Tab` from the field
onto the chip, so digits typed into a comment stay text. A markdown deletion
is always Remove and an insertion always Add. The general comment has no
intent.

A note gets its number when it is made and keeps it for the whole round.
Deleting a note never renumbers the others, so the output can have gaps. The
same number is on the mark, on its card, in the rendered image and in the
output, which lists the notes by position (line, page or time), not by
number. The next round starts at 1 again; earlier marks keep the round and
number they were raised with (`Round 1, mark 2`).

Notes saved before intents and numbers existed (a JSON export, a restored
draft, a session file from an earlier round) load as they are: the intent
comes from the type (a pin is a Question, a markdown deletion a Remove), the
number from the order the earlier version used.

Marks take their intent's colour. A shape can carry its own ink instead, for
visibility on a busy image: pick it in the composer's palette, or fix one for
new marks with the dock's colour button (**Intent colour** is the default).
The number badge always shows the intent's colour.

## Finishing a review

The split button at the top right is the only way out of a review. Its main
part follows the state: **Approve** while there is nothing to send, **Send
feedback** with the number of notes and pending replies otherwise. The chevron
next to it, or Ctrl/Cmd+Shift+Enter from anywhere, opens the decision dialog:

| Option | Output |
| --- | --- |
| Send feedback | The notes as change requests |
| Approve with notes | `APPROVED WITH NOTES: ...`, the notes are context |
| Approve | `APPROVED: ...`, the notes are discarded after one confirmation |

The dialog's optional summary is the general comment: it is prefilled with an
existing one and replaces it. Ctrl/Cmd+Enter submits the dialog. Outside the
dialog Ctrl/Cmd+Enter only saves the note being written, it never sends the
review.

The done page then shows what happened:

| Outcome | Shows |
| --- | --- |
| Send feedback | `Sent to <agent>`, the counts and the first notes |
| Approve | That the agent continues without changes to the target |
| Approve with notes | The notes in a dashed box, passed along as context |
| Session gone | `<agent> stopped waiting`: the session ended before the decision arrived, so nothing was delivered |

After a decision the tab closes as set in **Close tab after a decision**, with
a countdown that **Keep open** stops. The Session gone page never closes on
its own. It offers **Copy as Markdown**, **Save annotated image** (images and
PDF pages) and **Export JSON**, all made in the browser since the server is
no longer there, so the notes can go into the next session.

## Settings

The gear in the header opens the settings. Changes apply right away and are
kept in cookies on `localhost`, so they carry over between runs and modes;
**Reset to defaults** restores them.

| Section | Setting | Values |
| --- | --- | --- |
| General | Theme | Light, Dark, System |
| General | Close tab after a decision | Never (default), Now, 3 s, 5 s |
| General | Keep drafts | Markdown only: unsent notes survive a reload or a closed tab (default on). Image modes keep the notes on the server until the decision |
| General | Tool hints | The help line in the status bar, and in markdown mode the first-run hint for Shift+click (default on) |
| General | Default intent | The intent new shapes and text selections start with (default Change). Pins always start as Question |
| Markdown | Content width, Font size, Starting mode | Markdown mode only |
| Shortcuts | | The keys of the open mode, searchable, also opened with `?` |
| About | | Version and repository |

Settings saved by earlier versions are migrated when the annotator loads:
**Auto-save drafts** becomes **Keep drafts**, and the auto-close delay keeps
its value.

## Environment variables

| Variable | Applies to | Description |
|----------|------------|-------------|
| `ANNOTAITR_PORT` | both | Port or inclusive range (`3000` or `3000-3010`); the first free port wins |
| `ANNOTAITR_HOST` | both | Host to bind to (default `127.0.0.1`) |
| `ANNOTAITR_BROWSER` | both | Custom browser application |
| `ANNOTAITR_TIMEOUT` | both | Heartbeat timeout in ms (default `30000`, range `5000`-`300000`) |
| `ANNOTAITR_NO_OPEN` | both | Skip opening a browser tab automatically |
| `ANNOTAITR_SESSION_DIR` | image | Folder for [review sessions](#review-sessions) (default `<tmpdir>/annotaitr-sessions`) |
| `ANNOTAITR_CAPTURE_TIMEOUT` | image | Page-load timeout in ms for URL capture |
| `ANNOTAITR_WHISPER_MODEL` | image | Path to a whisper.cpp ggml model; enables [voice notes](#voice-notes) |
| `ANNOTAITR_WHISPER_BIN` | image | whisper.cpp binary (default `whisper-cli` on `PATH`) |
| `ANNOTAITR_WHISPER_LANG` | image | Spoken language for voice notes, e.g. `de` (default `auto`) |
| `ANNOTAITR_FEEDBACK_NOTES` | markdown | Same as `--feedback-notes` |
| `PLANTUML_SERVER_URL` | markdown | PlantUML render server (default `https://www.plantuml.com/plantuml`) |
| `KROKI_SERVER_URL` | markdown | Kroki render server (default `https://kroki.io`) |

> [!NOTE]
> `MD_ANNOTATOR_*` still works as a deprecated fallback for the
> corresponding `ANNOTAITR_*` variable, with a one-time warning on stderr.
> See [Migration](migration.md).

<!-- -->

> [!IMPORTANT]
> When rendering PlantUML or Kroki diagrams, the diagram source is encoded
> and sent to the configured server: the public `plantuml.com` and
> `kroki.io` by default. Self-host a [PlantUML
> server](https://hub.docker.com/r/plantuml/plantuml-server) or [Kroki
> server](https://docs.kroki.io/kroki/setup/install/) and set
> `PLANTUML_SERVER_URL` / `KROKI_SERVER_URL` if your diagrams are sensitive.

## Output and exit codes

The server starts on an available port and opens the browser; a status line
goes to stderr, the decision goes to stdout on exit. Feedback opens with the
count per intent, and every numbered note states its intent after its number
and handle:

```
3 annotations (1 Change, 1 Remove, 1 Question):

## 1. Change · Text (Line 3) [#a3f19c2e]
## 4. Remove · Text (Line 9) [#7b210e44]
## 2. Question · Text (Line 12) [#c01d9e55]
```

```
2 annotations (1 Change, 1 Question) on the screenshot.

### 1. [#a3f19c2e] Change · Boxed area: top left (~10% from top, ~12% from left)
### 3. [#7b210e44] Question · Comment pin: bottom (~80% from top, ~50% from left)
```

PDF and video feedback use the image form, a general comment has neither
number nor intent (`### [#c01d9e55] General comment about the whole image`).
`APPROVED WITH NOTES:` names the count per intent the same way
(`APPROVED WITH NOTES: 2 notes (1 Change, 1 Question). ...`).

| Exit code | Meaning |
|-----------|---------|
| `0` | Approved, or feedback submitted: stdout carries the formatted decision. Also a hint printed instead of opening the annotator (`PASTED CHAT IMAGE:`, `CONVERT TO PDF FIRST:`). `annotaitr reply` exits `0` once the reply is saved |
| `1` | An error (bad arguments, unsupported target), the browser tab was closed with no decision, or the process was interrupted (`Ctrl+C`), or `annotaitr reply` rejected its arguments |

`md-annotator` works as an alias for the same binary, for existing scripts
and shell aliases.

## See also

- [How it works](how-it-works.md): the annotation and review-loop mechanism
  behind each mode
- [Migrating from md-annotator](migration.md)
