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

Identifies the caller in the feedback output and to the client's origin
badge. One of `cli` (default), `claude-code`, `opencode`, `vibe`. Set
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

## Environment variables

| Variable | Applies to | Description |
|----------|------------|-------------|
| `ANNOTAITR_PORT` | both | Port or inclusive range (`3000` or `3000-3010`); the first free port wins |
| `ANNOTAITR_HOST` | both | Host to bind to (default `127.0.0.1`) |
| `ANNOTAITR_BROWSER` | both | Custom browser application |
| `ANNOTAITR_TIMEOUT` | both | Heartbeat timeout in ms (default `30000`, range `5000`-`300000`) |
| `ANNOTAITR_NO_OPEN` | both | Skip opening a browser tab automatically |
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
goes to stderr, the decision goes to stdout on exit:

| Exit code | Meaning |
|-----------|---------|
| `0` | Approved, or feedback submitted: stdout carries the formatted decision. Also a hint printed instead of opening the annotator (`PASTED CHAT IMAGE:`, `CONVERT TO PDF FIRST:`) |
| `1` | An error (bad arguments, unsupported target), the browser tab was closed with no decision, or the process was interrupted (`Ctrl+C`) |

`md-annotator` works as an alias for the same binary, for existing scripts
and shell aliases.

## See also

- [How it works](how-it-works.md): the annotation and review-loop mechanism
  behind each mode
- [Migrating from md-annotator](migration.md)
