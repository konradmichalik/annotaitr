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
| One or more existing files, all markdown/plain-text | Markdown |
| A single `http(s)` URL | Image (capture) |
| A single existing file with a supported image extension (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`) | Image (local file) |
| Anything else | Exits `1` naming the supported extensions and suggesting `--as` |

```bash
annotaitr README.md docs/guide.md    # markdown: multiple files, tab bar
annotaitr ./mockup.png               # image: local file
annotaitr http://localhost:3000      # image: capture
annotaitr                            # image: clipboard (macOS), or help
annotaitr ./diagram.svg              # image: SVG, rasterized to PNG
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

## `--origin`

Identifies the caller in the feedback output and to the client's origin
badge. One of `cli` (default), `claude-code`, `opencode`, `vibe`. Set
automatically by the Claude Code, OpenCode and Vibe integrations; a plain
terminal invocation never needs it.

## `--viewport`

Image mode only, and only meaningful when the target is a URL. A preset
(the default `desktop`, or `laptop`, `tablet`, `mobile`) or an explicit
`<width>x<height>`.

```bash
annotaitr --viewport mobile http://localhost:3000/checkout
annotaitr --viewport 1024x768 http://localhost:3000
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
| `0` | Approved, or feedback submitted: stdout carries the formatted decision |
| `1` | An error (bad arguments, unsupported target), the browser tab was closed with no decision, or the process was interrupted (`Ctrl+C`) |

`md-annotator` works as an alias for the same binary, for existing scripts
and shell aliases.

## See also

- [How it works](how-it-works.md): the annotation and review-loop mechanism
  behind each mode
- [Migrating from md-annotator](migration.md)
