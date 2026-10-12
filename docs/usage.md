# The `annotaitr` CLI

```bash
annotaitr [options] [target ...]
```

`annotaitr` is one binary for two review modes. Which mode runs is auto-detected from `target`. Every flag is mode-specific except `--help`, `--origin` and `--as`.

## Guides

| Target | Guide | Flags |
|--------|-------|-------|
| Web page (URL) | [Web pages](usage/web-pages.md) | `--viewport`, `--delay` |
| Image, SVG, clipboard | [Images and screenshots](usage/images.md) | |
| Video, GIF | [Videos and GIFs](usage/video.md) | |
| PDF | [PDFs](usage/pdf.md) | `--source`, `--pages` |
| Markdown, plain text, config files | [Markdown and plain text](usage/markdown.md) | `--feedback-notes` |
| Changes of a git branch | [Presenting changes before a commit](usage/markdown.md#presenting-changes-before-a-commit) | `annotaitr changes`, `--base`, `--explain` |

The same for every target:

| Topic | What's inside |
|-------|---------------|
| [Review sessions](usage/sessions.md) | Rounds, `annotaitr reply` and its statuses, `--session`, `--new-session`, replying to the agent |
| [Tools and the feedback panel](usage/interface.md) | Tool keys, writing a note, intents and numbers, finishing a review, settings |

## Mode detection

| Target | Mode |
|--------|------|
| No target, on macOS with an image on the clipboard | Image (clipboard) |
| No target, otherwise | Prints help and exits `0` |
| A Claude Code chat image chip (a target starting with `[Image`) | Prints a `PASTED CHAT IMAGE:` hint for the agent and exits `0` |
| One or more existing files, all markdown/plain-text | Markdown |
| A single `http(s)` URL | Image (capture) |
| A single existing file with a supported image extension (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`) | Image (local file) |
| Several existing files, all with a supported image extension | Image (a set, switched in the annotator) |
| A single existing video or GIF (`.mp4`, `.m4v`, `.webm`, `.mov`, `.gif`) | Image (video, on a timeline) |
| A single existing PDF | Image (document, page by page) |
| A single existing `.pptx`, `.ppt`, `.odp`, `.key`, `.docx`, `.doc`, `.odt`, `.rtf` or `.pages` | Prints a `CONVERT TO PDF FIRST:` hint and exits `0` |
| Several targets of which some do not exist | Exits `1` naming the missing files |
| Anything else | Exits `1` naming the supported extensions and suggesting `--as` |

A slash command passes its arguments to the shell unquoted, so a path with spaces arrives as several targets. When none of them exists but the targets joined by a space name an existing file, that file is used. Several paths with spaces still have to be quoted.

```bash
annotaitr README.md docs/guide.md    # markdown: multiple files, Files overview
annotaitr ./mockup.png               # image: local file
annotaitr ./sm.png ./md.png ./lg.png # image: several files, one session
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
"Terminal is waiting"). One of `cli` (default), `claude-code`, `codex`, `opencode`,
`vibe`, `gemini`. Set
automatically by the Claude Code, Codex, OpenCode, Vibe and Gemini CLI integrations; a plain
terminal invocation never needs it.

## Environment variables

| Variable | Applies to | Description |
|----------|------------|-------------|
| `ANNOTAITR_PORT` | both | Port or inclusive range (`3000` or `3000-3010`); the first free port wins |
| `ANNOTAITR_HOST` | both | Host to bind to (default `127.0.0.1`) |
| `ANNOTAITR_BROWSER` | both | Custom browser application |
| `ANNOTAITR_TIMEOUT` | both | Heartbeat timeout in ms (default `30000`, range `5000`-`300000`) |
| `ANNOTAITR_NO_OPEN` | both | Skip opening a browser tab automatically |
| `ANNOTAITR_SESSION_DIR` | image | Folder for [review sessions](usage/sessions.md) (default `<tmpdir>/annotaitr-sessions`) |
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

```text
3 annotations (1 Change, 1 Remove, 1 Question):

## 1. Change · Text (Line 3) [#a3f19c2e]
## 4. Remove · Text (Line 9) [#7b210e44]
## 2. Question · Text (Line 12) [#c01d9e55]
```

```text
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
| `0` | Approved, or feedback submitted: stdout carries the formatted decision. Also a hint printed instead of opening the annotator (`PASTED CHAT IMAGE:`, `CONVERT TO PDF FIRST:`). `annotaitr reply` exits `0` once the reply is saved, `annotaitr changes` exits `0` with `NO CHANGES:` when there is nothing to review |
| `1` | An error (bad arguments, unsupported target), the browser tab was closed with no decision, or the process was interrupted (`Ctrl+C`), or `annotaitr reply` rejected its arguments |

`md-annotator` works as an alias for the same binary, for existing scripts
and shell aliases.

## See also

- [How it works](how-it-works.md): the annotation and review-loop mechanism
  behind each mode
- [Migrating from md-annotator](migration.md)
