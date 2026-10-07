<div align="center">

# <picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.svg"><source media="(prefers-color-scheme: light)" srcset="docs/images/logo.svg"><img alt="annotaitr" src="docs/images/logo.svg" width="300"></picture>

An AI coding agent plugin that opens images, captured web pages, videos, GIFs, PDFs, or Markdown files in a browser-based annotator.

[![Test](https://github.com/konradmichalik/annotaitr/actions/workflows/test.yml/badge.svg)](https://github.com/konradmichalik/annotaitr/actions/workflows/test.yml)
[![License](https://img.shields.io/github/license/konradmichalik/annotaitr)](LICENSE)

![annotaitr](docs/images/screenshot.jpg)

</div>

An AI coding agent can read source code but has no way to point at a rendered
page or a prose document and say "this, right here." annotaitr closes that
gap: it captures a web page or opens an image or Markdown file in the
browser, lets a person mark it up with boxes, arrows and comments or with
text selections, and hands the agent back structured feedback it can act on
directly, instead of the person writing out pixel coordinates or line
numbers by hand.

## ✨ Features

Which mode runs is auto-detected from the target: see Usage below and
[How it works](docs/how-it-works.md) for the mechanism behind both.

**Image and web page review:**

- **Web page capture**: full-page screenshot of any `http(s)` URL via Playwright, at a chosen viewport and optional delay; switch viewport, section or delay from the open tab to capture again in place
- **Clipboard support**: run with no target to annotate whatever screenshot is on the (macOS) clipboard, or pass a screenshot pasted into the Claude Code chat
- **Drawing tools**: boxes, arrows (with an optional dimension-line style for marking distance/spacing), freehand marks, highlighter marks, and numbered comment pins, each with an optional comment and color
- **Coarse position descriptions**: feedback names each annotation's plain-language position, and flags annotations positioned close together
- **Page element names**: on a captured URL, the Element tool picks a page element straight from the screenshot, and feedback names the element under each mark (tag, alt or text, media file, short selector), so the agent can find it in the source
- **Annotated screenshot export**: submitting bakes the markup into a copy of the image and passes its path to the agent; the annotator can also copy that image or the feedback as Markdown, or save the image, for a ticket or a colleague
- **Voice notes**: speak a comment instead of typing it, transcribed locally with whisper.cpp when it is installed
- **Videos and GIFs**: annotate screen recordings on a timeline, as single moments or spans; the agent gets each annotated frame as a PNG plus a strip per span and an overview
- **PDFs**: review a generated slide deck or document page by page; the agent gets one annotated image per page, feedback grouped by page and the source file to edit

**Markdown and plain-text review:**

- **Multi-file support**: review multiple files in one session with a tabbed interface
- **Config and data files**: annotate YAML, JSON, TOML, CSV, XML and more as raw source with line numbers
- **Linked navigation**: click relative `.md` links to open them as new tabs
- **LaTeX math, Mermaid, PlantUML, and Kroki diagrams**: rendered inline, annotatable as a whole
- **File references**: type `@` in a comment to autocomplete other project files
- **Quick labels**: categorize a selection instantly with a predefined label
- **Annotation persistence**: annotations auto-save to the server and survive page reloads

**Both modes:**

- **Export and import**: annotations as Markdown or JSON, to continue a review later
- **Dark mode**, **undo/redo**, and an **auto-close** timer after submitting
- **Iterative review**: the agent applies your feedback and re-opens the annotator for another round until you approve

## 🔥 Installation

> [!IMPORTANT]
> Requires Node.js 22.13+ and npm. Image mode additionally needs `playwright`
> and `@napi-rs/canvas`, PDFs need `pdfjs-dist`, all `optionalDependencies`
> installed by default. A
> markdown-only install can skip them and gets an actionable error if image
> mode is ever invoked without them. Web page capture also needs a Chromium
> build for playwright, which npm does not download:
> `npx playwright install chromium`.

Upgrading from `md-annotator`? See [docs/migration.md](docs/migration.md).

### Claude Code plugin

```bash
claude plugin marketplace add konradmichalik/annotaitr
claude plugin install annotaitr@annotaitr
```

Or via the installer script, which also installs the standalone CLI:

```bash
curl -fsSL https://konradmichalik.github.io/annotaitr/install.sh | bash
```

### OpenCode plugin

Markdown-only for now. Add to `opencode.json`:

```json
{
  "plugin": ["annotaitr-opencode@latest"]
}
```

### Mistral Vibe skill

Markdown-only for now, and drives the standalone CLI, so install that too:

```bash
curl -fsSL https://konradmichalik.github.io/annotaitr/install.sh | bash
cp -r apps/vibe/skills/annotate ~/.vibe/skills/annotate
```

### Standalone CLI

```bash
npm install -g annotaitr
```

## 🚀 Quick start

```bash
annotaitr README.md
```

Opens `README.md` in the browser; approve it or leave annotations, and
`annotaitr` prints the result to stdout once you're done.

## ⚡ Usage

**Claude Code:**

```text
/annotaitr:review ./anything      # auto-detects image vs. markdown
```

Or force a mode directly: `/annotaitr:md README.md`, `/annotaitr:image ./mockup.png`.

A screenshot pasted into the chat works as a target too: `/annotaitr:image [Image #1]`. Claude looks up the saved image and opens the annotator on it in the background, which takes a few seconds longer than passing a path.

**OpenCode:**

```text
/annotate:md README.md
```

or the tool directly: `annotate_markdown({ filePath: "/path/to/file.md" })`.

**Mistral Vibe:**

```text
/annotate README.md
```

**Standalone CLI**, mode auto-detected from the target:

```bash
annotaitr README.md               # markdown
annotaitr ./mockup.png            # image, local file
annotaitr http://localhost:3000   # image, capture
annotaitr ./bug-recording.mov     # image, video on a timeline
annotaitr ./deck.pdf --source ./deck.pptx   # image, PDF page by page
```

Full flag and environment variable reference: [docs/usage.md](docs/usage.md).

## 📚 Documentation

| Topic | What's inside |
|-------|----------------|
| [Usage](docs/usage.md) | Every flag, environment variable, exit code, and the mode-detection rules |
| [How it works](docs/how-it-works.md) | The annotation and review-loop mechanism behind each mode |
| [Development](docs/development.md) | Local setup, build commands, plugin testing |
| [Design](docs/design/rules.md) | Design rules for the UI and the [reference screens](docs/design/screens.md) |

## 🧑‍💻 Contributing

Please have a look at [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 💎 Credits

Heavily inspired by [plannotator](https://plannotator.ai/), which pioneered
this general browser-markup-and-feedback approach for reviewing planning
documents; annotaitr applies it to images, captured web pages, and
Markdown/plain-text files.

## ⭐ License

This project is licensed under [MIT](LICENSE).
