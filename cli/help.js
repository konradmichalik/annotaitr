import { videoExtensions } from '../server/image/common/fileTypes.js'

export const CHAT_IMAGE_HINT =
  'PASTED CHAT IMAGE: the target is an image pasted or dropped into the chat, not a file path. ' +
  'Find the `[Image: source: <path>]` line for it in the conversation and run annotaitr on that path.\n'

const HELP_TEXT = `
annotaitr — Annotate an image, a captured web page, a video or GIF, or
Markdown/plain-text files in the browser

Usage:
  annotaitr [options] [target ...]
  annotaitr reply --session <id> --to <handle> --status <status> --text <text>

Which mode runs is auto-detected from the target:
  - no target                  reads an image from the clipboard (macOS only)
  - one or more existing files, all markdown/plain-text   -> markdown mode
  - a single http(s) URL                                   -> image mode (capture)
  - a single existing image file (.png, .jpg, .jpeg, .webp, .svg) -> image mode
  - a single existing video or GIF (${videoExtensions().join(', ')}) -> image mode,
    annotated on a timeline, with every annotated frame exported as PNG
  - a single existing PDF                                  -> image mode, page by page,
    with every annotated page exported as PNG
  - a PowerPoint, Word, Keynote, Pages or OpenDocument file prints how to
    export it to PDF first, nothing is converted here

Options:
  --help                       Show this help message
  --origin <name>               Set caller origin (cli, claude-code, codex, opencode, vibe)
  --as <image|markdown>         Skip detection, force a mode
  --viewport <preset|WxH>       Image mode only: desktop (default) | laptop | tablet | mobile | <W>x<H>
  --delay <ms>                  Image mode only: wait this long after the page loads before capturing (0 to 10000)
  --feedback-notes <json|path>  Markdown mode only: AI notes to display as read-only annotations
  --source <path>               PDF only: the file the PDF was rendered from, named in the feedback
  --pages <range>               PDF only: review only these pages, e.g. 1-5,8,12-
  --session <id>                Image mode only: continue this review session (the id printed after "Session:")
  --new-session                 Image mode only: start a new review session instead of continuing the last one

Markdown files supported:
  Markdown (.md, .markdown, .mdown, .mkd) renders as formatted markdown.
  Config and data files (.yaml, .yml, .json, .jsonc, .json5, .toml, .ini,
  .cfg, .conf, .properties, .csv, .tsv, .log, .xml, .txt, .text,
  .env.example) render as raw source with line numbers.
  Files above 2 MB are rejected. A real .env file is not supported — it
  commonly holds secrets (.env.example is fine).

Environment:
  ANNOTAITR_PORT            Port or inclusive range, e.g. 3000 or 3000-3010
  ANNOTAITR_HOST             Host to bind to (default: 127.0.0.1)
  ANNOTAITR_BROWSER          Custom browser app name
  ANNOTAITR_TIMEOUT          Heartbeat timeout in ms (default: 30000, range: 5000-300000)
  ANNOTAITR_NO_OPEN          Skip opening a browser tab automatically
  ANNOTAITR_SESSION_DIR      Image mode: folder for review sessions (default: <tmpdir>/annotaitr-sessions)
  ANNOTAITR_CAPTURE_TIMEOUT  Image mode: page-load timeout in ms for URL capture
  ANNOTAITR_WHISPER_MODEL    Image mode: whisper.cpp model path, enables voice notes
  ANNOTAITR_WHISPER_BIN      Image mode: whisper.cpp binary (default: whisper-cli)
  ANNOTAITR_WHISPER_LANG     Image mode: voice note language, e.g. de (default: auto)
  ANNOTAITR_FEEDBACK_NOTES   Markdown mode: JSON string or file path for feedback notes
  (MD_ANNOTATOR_* still works as a deprecated fallback)

Examples:
  annotaitr README.md
  annotaitr docs/api.md docs/guide.md
  annotaitr ./mockup.png
  annotaitr http://localhost:3000
  annotaitr --viewport mobile http://localhost:3000/checkout
  annotaitr ./diagram.svg
  annotaitr ./bug-recording.mov
  annotaitr ./deck.pdf --source ./deck.pptx
  annotaitr                              # read an image from the clipboard (macOS)
`.trim()

export function fail(message) {
  process.stderr.write(`Error: ${message}\n\n${HELP_TEXT}\n`)
  process.exit(1)
}

export function printHelpAndExit(code) {
  process.stderr.write(HELP_TEXT + '\n')
  process.exit(code)
}
