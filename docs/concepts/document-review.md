# Concept: Document review (PDF)

Status: draft 4 / S1 and S2 implemented
Scope: image mode
Related: [How it works](../how-it-works.md) → "Image mode", "Videos and GIFs";
[Usage](../usage.md) → "Mode detection"

Draft 3 narrowed the scope to PDF as the only document format. Converting
PowerPoint, Word, Keynote or Pages files is left to whoever produced them.
Draft 4 aligns the design with the CLI dispatch in `index.js` and fixes
rendering, memory and staleness gaps found in a review against the code.
Section 8 lists what changed, section 9 what was verified.

## 1. Problem

annotaitr can point at a rendered web page, a still image, a recording or a
prose file, but not at documents with pages. The case that matters most is an
agent that has just generated a slide deck through a skill (PPTX via
`python-pptx` or `pptxgenjs`, Keynote via AppleScript, Marp or Slidev from
markdown) and now needs human feedback on it. Today that stops at mode
detection:

- **No document extension is recognised.** `detectMode()` (`index.js`) knows
  markdown/plain-text, `http(s)` URLs, image files and video files. A `.pdf`
  falls through to `buildDetectionError()` and exits `1` with "Unsupported
  target".
- **Image mode is single-target by design.** `detectMode()` only considers
  image mode when `targets.length === 1`, and `test/cli.test.js` pins this
  ("errors on more than one image-shaped target"). A deck is a sequence of
  pages, so even exporting every slide to PNG by hand only allows one slide per
  session.
- **The server state holds one image.** `buildImageServer()`
  (`server/image/still/adapter.js`) keeps exactly one `capture` (`buffer`, `width`,
  `height`, `domMap`), and `exportFeedback()` (`server/image/common/feedback.js`)
  formats one image's annotations against one width/height and one annotated
  screenshot path.

## 2. Goal

Open a PDF in image mode as an ordered set of pages, let the reviewer mark up
any page with the existing tools, and hand the agent per-page feedback plus
one annotated image per touched page. When the PDF is a rendering of another
file (the `.pptx` the agent actually edits), the feedback points the agent at
that file.

**PDF is the only document input.** Producing it is the job of whoever
produced the document:

- A deck-generating skill already renders to PDF. Anthropic's `pptx` skill,
  for example, converts every generated deck with LibreOffice
  (`soffice --headless --convert-to pdf`) and rasterises the PDF for its own
  visual QA, and it regenerates the PDF after every fix.
- An agent can only create Keynote files through AppleScript with Keynote
  installed; exporting a PDF is one more line in the same script.
- Marp, Slidev and similar tools have a PDF export built in.
- A person who wants their own deck reviewed exports a PDF from the app,
  which is two clicks.

**Non-goals.**

- No conversion of `.pptx`, `.docx`, `.key`, `.pages` or any other format
  inside annotaitr: no LibreOffice, no AppleScript, no app automation. A
  target in one of these formats gets a hint (3.3), not a conversion.
- Not a PDF editor. Annotations are not written back into the PDF (7.3).
- No markdown-style text annotations (strike, insert) on PDF text. The text
  layer is used to *name* what a mark points at (3.5), not to edit it.
- OpenCode and Mistral Vibe stay markdown-only, as they are today.

## 3. Design

### 3.1 Pipeline

```
agent / skill:  deck.pptx ──(its own PDF export)──> deck.pdf
annotaitr:      deck.pdf (+ --source deck.pptx)
                  └─ render pages (3.4) ─ annotate ─ flatten per page (3.7) ─ feedback (3.8)
                  └─ text layer (3.5) ─────────────────────────────────────┘
```

The design reuses the shape the video mode established: video is "image mode
on a timeline", where every annotation carries a `time` and the output is a
set of baked frames plus an overview. A document is image mode on a list of
pages: every annotation carries a `page`, and the output is a set of baked
pages plus an overview.

### 3.2 Mode detection and dispatch

| Target | Result |
|--------|--------|
| A single existing `.pdf` | Image mode, document review |
| A single existing `.pptx`, `.ppt`, `.odp`, `.key`, `.docx`, `.doc`, `.odt`, `.rtf`, `.pages` | Prints a `CONVERT TO PDF FIRST:` hint and exits `0` (3.3) |

`detectMode()` alone does not route anything. `main()` only reads
`detected.mode`, the `capture` field is never consumed, and `runImage()`
re-detects a video on its own through `isVideoTarget()` before calling
`runVideo()`. The PDF path follows the video precedent instead of adding a
new kind of detection result:

- **Detection.** `detectMode()` returns `{ mode: 'image' }` for a single
  existing PDF, next to the image and video checks.
- **Dispatch.** `runImage()` gets a branch in front of the video one:
  `if (targets.length === 1 && isPdfTarget(targets[0])) { await runDocument(...) }`.
  This also makes `--as image deck.pdf` work, which bypasses `detectMode()`.
- **Hint.** Handled in `main()` before detection, like the `[Image` chip and
  `CHAT_IMAGE_HINT`: if the single target is an existing office document,
  print the hint and return. It is not a mode, so it never reaches the
  `Unknown mode` error, and `--as` does not suppress it.

`isPdfFile()` and `isOfficeDocument()` live next to `isImageFile()` /
`isVideoFile()` in `server/image/common/fileTypes.js`. `buildDetectionError()` lists
`.pdf` with the image and video extensions. `--as markdown` on a PDF fails as
it does for any non-markdown file today. With more than one target, an
office document gets the generic multi-target error, not the hint.

Keynote and Pages documents can be package directories instead of single
files (File → Advanced → Change File Type). `fileExists()` uses
`access(path, R_OK)`, which accepts directories, and
`path.extname('deck.key/')` returns `.key` even with the trailing slash shell
completion adds, so the hint fires for both forms.

**New flags:**

- `--source <path>`: the file the PDF was rendered from (3.6).
- `--pages <range>`: `--pages 1-5,8,12-` restricts a session to those pages,
  for long documents (page limit in 3.4) and focused rounds ("only look at the
  new slides 9-11"). Page numbers in the feedback stay the document's own
  numbers, never renumbered to the selection. A range outside the document
  exits `1`.

**Flag validation**, alongside the existing checks in `main()`:

| Flag | Allowed with | Otherwise |
|------|--------------|-----------|
| `--source`, `--pages` | a PDF target | exit `1`: "only applies to a PDF target" |
| `--viewport`, `--delay` | not with a PDF | exit `1`, as for markdown today |
| `--feedback-notes` | unchanged: markdown only | unchanged |

### 3.3 Hint instead of conversion

`annotaitr deck.pptx` does not fail. It prints a hint aimed at the agent and
exits `0`, the same pattern annotaitr already uses for a pasted `[Image` chip,
so a Claude Code slash command does not abort:

```
CONVERT TO PDF FIRST: deck.pptx
annotaitr reviews documents as PDF. Export deck.pptx to PDF with the tool that
created it, then run:
  annotaitr deck.pdf --source deck.pptx
```

The agent knows how it built the file and therefore how to render it; the
command files (3.11) tell it what to do with this hint. A person running the
CLI by hand reads the same hint and exports a PDF from the app.

### 3.4 Rendering PDF pages

**Library: `pdfjs-dist`, legacy build** (`pdfjs-dist/legacy/build/pdf.mjs`),
rendering through `@napi-rs/canvas`. The modern build loads in Node but logs
"Please use the `legacy` build in Node.js environments", so the legacy build
is the supported path.

**Dependency facts (npm registry):**

- `pdfjs-dist` is at 6.x (6.4.299 at the time of writing) and declares
  `engines: node >=22.13.0 || >=24`. annotaitr declares `node >=22`. Either
  raise annotaitr's floor to `>=22.13` (released January 2025) or pin
  `pdfjs-dist` to a range whose engine field still matches (open question 5).
- `pdfjs-dist` lists `@napi-rs/canvas ^1.0.10` as its own optional
  dependency. annotaitr has `^1.0.8`; bump it so both resolve to one copy.
- `pdfjs-dist` unpacks to about 35 MB (mostly CMaps, fonts and source maps).
  It joins `optionalDependencies` next to `playwright` and `@napi-rs/canvas`.
  npm installs optional dependencies by default, so a normal install gets it;
  it is only missing after `npm install --omit=optional` or a failed optional
  install. That case gets the same kind of actionable error image mode already
  gives: `loadImageRuntime()` (`index.js`) currently names only `playwright`
  and `@napi-rs/canvas`, so the PDF path loads its own runtime and names
  `pdfjs-dist` and `@napi-rs/canvas` in its message (Playwright is not needed
  for a PDF).

**Rendering happens on the server**, not in the browser. `flattenAnnotations()`
(`server/image/common/render.js`) needs every page as a buffer on the server anyway,
SVG rasterisation in `server/image/still/loader.js` already works this way, and it
keeps the client bundle free of pdf.js. 7.1 covers the client-side
alternative.

```js
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'

const doc = await getDocument({
  data,                                   // Uint8Array of the file
  standardFontDataUrl: `${pdfjsDir}/standard_fonts/`,
  cMapUrl: `${pdfjsDir}/cmaps/`,
  isEvalSupported: false                  // see "Security"
}).promise
const page = await doc.getPage(n)
const base = page.getViewport({ scale: 1 })
const viewport = page.getViewport({ scale: 2000 / Math.max(base.width, base.height) })
const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height))
await page.render({ canvas, viewport }).promise
const png = canvas.toBuffer('image/png')
```

`pdfjsDir` is resolved from the installed package
(`dirname(require.resolve('pdfjs-dist/package.json'))`), never copied into the
repo. Plain file paths with a trailing slash work in Node.

Details:

- **Scale.** Longer side 2000px, clamped to `config.maxImageDimension`.
  Slides (16:9) come out at 2000×1125, A4 portrait around 1414×2000. A simple
  slide rendered in about 55 ms in the prototype. `ANNOTAITR_PDF_SCALE` if it
  turns out to matter.
- **Lazy rendering.** `/api/meta` only needs page count and page sizes, which
  come from `getPage()` and `getViewport()` without rasterising. A page is
  rendered when it is first requested.
- **Thumbnails are rendered at their own scale**, not downscaled from the full
  render. Scrolling the strip of a 200-page document would otherwise force 200
  full renders (about 11 s of render time at 55 ms each) and keep them all in
  memory. A thumbnail at around 200px renders in a fraction of the time and
  can be cached for the whole session.
- **Full renders sit in a small LRU cache** (a handful of pages: the current
  one and its neighbours). An evicted page is rendered again on demand. On
  submit, the touched pages are rendered again if they are no longer cached
  and then flattened, so memory stays bounded by the cache size, not the page
  count.
- **Rendering runs in a worker thread with a timeout.** pdf.js runs its "fake
  worker" on the main thread in Node, so a render blocks the Express server
  while it runs. Tens of milliseconds for an ordinary page are harmless, but
  a crafted or simply huge page (a 600 dpi scan, deeply nested vector art)
  can take seconds, during which heartbeat and decision routes stall (the
  heartbeat timeout is 30 s, `server/core/config.js`). Since a PDF is
  untrusted input (see "Security"), S1 renders in a `worker_threads` worker:
  the main thread posts a page number and scale, the worker returns a PNG
  buffer (and, from S2, the text-layer map). A render that exceeds a timeout
  (around 10 s) terminates the worker, the page shows an error placeholder,
  and a fresh worker serves the next request. The worker also gives the
  rest of the document a way to keep working when one page is broken.
  The spike (section 9) confirmed the approach: `@napi-rs/canvas` and the
  pdf.js legacy build run in a worker thread, a stuck render is terminated
  within a second, and the main thread stays responsive throughout. Two
  findings shape the protocol: the PNG buffer from `canvas.toBuffer()` cannot
  go in a transfer list (`DataCloneError`), so it is copied on `postMessage`,
  which is negligible at tens of kilobytes per page; and the timeout applies
  to thumbnails too, since a hostile page that takes 16 s at 2000px still
  took 2 s at 200px.
- **Page limit.** `MAX_PAGES = 200` per session, analogous to
  `MAX_FRAMES = 50` in `server/image/video/timeline.js`. A larger document exits `1`
  with a hint to use `--pages`.
- **Fonts and CMaps are required.** Without `standardFontDataUrl`, a PDF using
  non-embedded standard fonts (Helvetica, Times) logs "Ensure that the
  `standardFontDataUrl` API parameter is provided" and renders with
  substitutes. Office and Keynote exports usually embed their fonts; generated
  PDFs often do not.
- **Encrypted PDFs.** pdf.js rejects with `PasswordException` (`code` 1: no
  password given, 2: wrong password). Exit `1` with "Encrypted PDF, remove the
  password or export an unprotected copy". No password prompt.
- **Background.** pdf.js already paints an opaque white page background, so,
  unlike SVG rasterisation, no extra step is needed.

**Security.** A PDF is untrusted input, and here it is parsed inside the Node
process, not a browser sandbox. CVE-2024-4367 allowed arbitrary JavaScript
execution through crafted fonts in `pdfjs-dist` up to 4.1.392 (fixed in
4.2.67); in Node that means code execution with the user's rights. Therefore:
require a `pdfjs-dist` version well above that, always pass
`isEvalSupported: false` as defence in depth, never enable PDF scripting, and
keep `pdfjs-dist` under Dependabot/Renovate. The render worker bounds
resource exhaustion (time per page); it is not a security sandbox.

### 3.5 Text layer as an element map

For a captured URL, image mode records a map of visible elements and matches
every mark to one (`server/image/common/domMap.js`, `server/image/common/elementMatch.js`),
producing lines such as `Element: img "Team photo" ("team.jpg") · #hero img`.
PDFs have an equivalent: `page.getTextContent()` returns every text run with
its position.

What the prototype showed about the raw items:

- Each item has `str`, `transform` (a 6-number matrix; `[4]`/`[5]` are the
  position in PDF user space), `width`, `height` and `fontName`.
- Bullets are separate items (`"•"`), and there are empty-string and
  single-space items between runs. They are dropped or merged before blocks
  are built.
- Font size is the scale in the matrix,
  `Math.hypot(transform[0], transform[1])`. Title and body differed clearly in
  the test deck (44 vs 32).
- `viewport.convertToViewportPoint(x, y)` maps PDF user space into the
  rendered page's pixels, so element boxes and annotation geometry share one
  coordinate system.

Per-page map in the shape `matchAnnotation()` already consumes:

- **Text blocks.** Drop empty and whitespace-only items, merge runs into lines
  (same baseline, small horizontal gap) and lines into blocks (same column,
  small leading). Each block becomes
  `{ box, tag: 'text', name: <first ~80 chars> }`.
- **Headings.** A block whose font size is clearly above the page's dominant
  body size gets `tag: 'heading'`, mirroring how unnamed panels in the DOM map
  are named after their first heading.
- **Links.** `page.getAnnotations()` yields `Link` annotations with `rect` and
  `url`. They become `{ tag: 'link', name: <url> }`. Whether a PDF has them
  depends on the exporter (LibreOffice keeps them; PowerPoint for Mac drops
  hyperlinks in its PDF export), so absent links are normal. A link target is
  as attacker-controlled as the text and gets the same cap and quoting.

The matching logic in `elementMatch.js` stays shared and unchanged: `text`,
`heading` and `link` are not in `CONTAINERS`, so they rank as specific
elements. Only the element source and the feedback formatting are new. The
formatter prints a `Text:` line instead of the `Element:` line used for a
captured page, without a selector:

```
Text: heading "Revenue by region"
```

Carried over from the DOM map: text and link targets are capped and quoted, a
failure to build the map never fails the session, it just drops the element
lines. The notice that precedes element lines (`ELEMENT_NOTICE` in
`server/image/common/feedback.js`) talks about "the captured page"; document feedback
gets its own wording that names the PDF's text as untrusted document content.
Scanned PDFs have no text layer, so their feedback looks like a local image's
today. No OCR.

`POINT_REACH` (24px, how far a pin may land outside an element and still name
it) was tuned for screenshots at one CSS pixel per pixel. A slide rendered at
2000px is roughly twice that density, so the reach is about half as generous.
S2 checks it on the fixtures and scales it with the render if needed.

The quoted text matters most where page numbers are weak: in a rendered Word
document, pagination depends on the renderer, but the quote still locates the
passage in the source.

### 3.6 Source binding

`--source <path>` tells annotaitr which file the PDF was rendered from. It
accepts any existing path, file or directory, because the source can be a
`.pptx`, a `.key` package, a Marp `deck.md` or a Slidev project.

- **Feedback** names it: `Source: deck.pptx`, and the agent edits that file,
  never the PDF. Without `--source`, the feedback says `Source: deck.pdf` and
  nothing else changes.
- **Staleness check.** If the source was modified after the PDF, annotaitr
  warns before the review starts, in the terminal and as a banner in the
  annotator: "deck.pptx is newer than deck.pdf. The PDF may be outdated,
  regenerate it before reviewing." It warns, it does not block: the agent may
  have touched the source without changing what renders.
- **Directory sources.** A package directory's own mtime does not change when
  a contained file does, so the check uses the newest mtime of the files
  inside. The walk skips `node_modules`, `.git` and dot-directories as well as
  common build output (`dist`, `build`), and stops after a fixed number of
  files (around 5000). Otherwise a Slidev project scans its whole dependency
  tree, and an `npm install` after the export reports a stale PDF that is not
  stale. When the cap is hit, the check is skipped with a note in the terminal
  rather than guessing.

### 3.7 Server state, API and client

A new `buildDocumentServer()` in `server/image/document/adapter.js`, next to
`buildVideoServer()`, mounting `createDocumentApiRouter()` from
`server/image/document/routes.js`. The image client bundle switches UI on the
`kind` in `/api/meta`, as it does for video.

```js
const state = {
  annotations: [],
  document: {
    pdfPath,
    sourcePath,          // from --source, or null
    sourceIsNewer,       // staleness check result
    pageCount,
    pages: [{ number, width, height }]    // only pages in --pages
  },
  renderer,              // worker handle, see 3.4
  renders: new LruCache(),   // page number -> { buffer, elements }
  thumbs: new Map(),     // page number -> PNG buffer
  deciding: false, decided: false
}
```

| Route | Purpose |
|-------|---------|
| `GET /api/meta` | `kind: 'document'`, `targetLabel`, `source`, `sourceIsNewer`, `pages` |
| `GET /api/pages/:n/image` | rendered page as PNG |
| `GET /api/pages/:n/thumb` | thumbnail rendered at thumbnail scale (3.4) |
| `GET /api/pages/:n/elements` | text-layer map for that page |
| `POST /api/annotations`, decision routes | as in image mode |

**Annotations carry `page`**, the document counterpart of the video mode's
`time`: a 1-based integer inside the session's page set, validated like
`validateVideoAnnotations()` does for `time`. The existing limits
(`annotationsWithinLimits()` in `server/image/still/routes.js`) apply unchanged.
Geometry stays in the page's own pixels, so `describePosition()` and the
nearby-annotation logic work per page without changes.

General comments come in two flavours: about the whole document
(`page: null`) and about one page (`type: 'comment'` with a `page`). The second
is the natural way to say "this slide is too dense" without drawing a box
around everything.

**Client.** Canvas, tools, comment popover, undo/redo and export menu are
reused. New pieces:

- **Page strip** with lazily loaded thumbnails and a per-page annotation
  count badge (placement: open question 1).
- **Navigation:** `PageUp`/`PageDown` and `[`/`]`, `Home`/`End`, in a new
  `useDocumentShortcuts.js` next to `useTimelineShortcuts.js`.
- **Annotation panel grouped by page**; clicking an entry jumps to its page.
- **Page comment** button next to the existing general comment.
- **Staleness banner** when `sourceIsNewer` (3.6).
- **Error placeholder** for a page whose render failed or timed out (3.4).
- **Element hover and Element tool**, today only offered for a captured URL,
  for every page with a text-layer map.

### 3.8 Output and feedback

On submit, every page with at least one annotation is flattened with the
existing `flattenAnnotations()` into its own file, plus an overview of the
touched pages, in the style the video output uses:

```
/tmp/annotaitr-XXXX/
  page-03.png
  page-07.png
  overview.png
```

**Overview with mixed page sizes.** `composeContactSheet()`
(`server/image/common/render.js`) assumes all tiles share one size: it takes width
and height from the first tile and draws every other tile into that cell.
Video frames satisfy this, PDF pages do not (an A4 report with a landscape
table page, a deck with an appended portrait handout). The function is
extended so each tile is fitted into a fixed square cell, aspect ratio
preserved and centred, with the label underneath. Same-size tiles render as
before, so the video output does not change; a test pins both cases.

**Numbering.** Annotation numbers are global: pages in document order, within
a page the order image mode uses today (the annotation array order), general
comments last. The numbers passed to `flattenAnnotations()` are the ones the
feedback prints, so number `5` means the same in the image and in the text.
Untouched pages are never written.

```markdown
5 annotations on 2 of 12 pages.

Source: deck.pptx (rendered as deck.pdf)
Overview: /tmp/annotaitr-XXXX/overview.png
Look at each page image, then match each note below to the visible element or quoted text.

## Page 3
Annotated page: /tmp/annotaitr-XXXX/page-03.png

### 1. [#a3f19c2e] Box: top right, ~15% from top
Text: heading "Revenue by region"
> Use the same colours as on page 2

### 2. [#7b210e44] Page comment
> Too much text on this slide, split it

## Page 7
...

## General
### 5. [#c01d9e55] General comment about the whole document
> Consistent title capitalisation please
```

If the staleness check fired, the feedback repeats it in one line under
`Source:`, so the agent knows the reviewer may have looked at an old
rendering. `formatApprovalWithNotesOutput()` gets the same per-page
structure. The copy-as-Markdown export in the client produces the same text
without temp paths, as it already does for images.

### 3.9 Page versus slide

annotaitr no longer knows how the PDF was made, so it does not try to map
pages to slides. The feedback says "Page N", and the agent instructions
(3.11) carry the one caveat that matters: page N is slide N only if the deck
has no hidden or skipped slides, because most exporters leave those out
(LibreOffice does by default, verified; Keynote does with
`skipped slides:false`). Generated decks rarely have hidden slides, so in
the main use case this holds. Where it does not, or for paginated text
documents, the quoted `Text:` lines locate the content.

### 3.10 The review loop

The agent applies the feedback to the source, regenerates the PDF with the
same tool and re-opens the annotator on it. Every run starts with an empty
set of annotations: unlike the markdown client, the image client persists no
annotation draft at all (only settings, as cookies), so nothing can leak from
one round into the next and no content hash is needed in S1. The staleness
check (3.6) catches the one mistake this loop invites: re-opening the old PDF
after editing the source.

A hash over the PDF becomes necessary once something is persisted across a
reload, such as the last viewed page (S3), or once marks are carried across
rounds. The latter is the job of the
[inline agent replies](inline-agent-replies.md) concept; the `page` field and
per-page handles are compatible with its re-anchoring. The hash is then taken
over the PDF, which is what the annotations' coordinates belong to.

### 3.11 Agent integration

`apps/claude-code/commands/review.md` and `image.md` get two additions.

**Handling the hint.** If the output starts with `CONVERT TO PDF FIRST:`,
render the named file to PDF with the tooling that created it (for a deck
built with the `pptx` skill, its LibreOffice wrapper; for Keynote, the
AppleScript `export … as PDF`; for Marp or Slidev, their PDF export), then run
the command the hint prints, in the background as for every blocking
annotaitr call. If the agent did not create the file and has no way to render
it, ask the user to export a PDF.

**Handling document feedback**, recognisable by `Source:` and `## Page`
headings:

- Edit the file named in `Source:`, never the PDF.
- Page N equals slide N only if the deck has no hidden or skipped slides;
  otherwise, and for text documents, locate content by the quoted `Text:`
  lines.
- `.pptx`/`.docx`: edit with the same library or skill that created it.
  Generated decks (Marp, Slidev, reveal.js): edit the markdown or HTML source.
- `.key`/`.pages` and plain PDFs without a source: usually not editable by
  the agent; summarise the requested changes per page for the user instead.
- After changes, regenerate the PDF and re-open the annotator with the same
  `--source`.

No new slash command. `/annotaitr:review` auto-detects PDFs like any other
target, and `/annotaitr:image` accepts them because they are image mode.

## 4. Staged delivery

Each stage is shippable on its own.

**S1: Multi-page image mode with PDF.** Engine floor and dependency bumps
(3.4), PDF detection and the `runDocument()` dispatch branch (3.2),
`pdfjs-dist` rendering with the security options in a worker thread with a
render timeout, thumbnails at their own scale and an LRU cache for full
renders, page strip and navigation, `page` on annotations, per-page
flattening, overview with mixed page sizes, per-page feedback, `--pages`,
`--source` with staleness check, flag validation, the `CONVERT TO PDF FIRST:`
hint, agent command updates. Tests: detection (PDF, office extensions,
package directory), `--as image` on a PDF, hint output and exit code, flag
validation (`--source`/`--pages` without a PDF, `--viewport`/`--delay` with
one), page validation, feedback formatting, contact sheet with mixed page
sizes and unchanged video output, staleness check including the
`node_modules` exclusion and the file cap, render timeout, encrypted-PDF
error, an end-to-end Playwright run on a small fixture PDF.

**S2: Text layer.** Text block, heading and link extraction (in the render
worker), mapping into the shared element matcher, `Text:` lines in feedback,
element hover and tool on document pages. Tests: block merging on fixtures
with known layout (including bullets and whitespace items), client/server
matching parity (as already exists for the DOM map).

**S3: Polish.** Page comments if they did not make S1, thumbnail badges,
remembering the last viewed page across a reload (introduces the PDF content
hash, 3.10), prefetching neighbouring pages in the worker.

## 5. Risks and honest assessment

- **pdf.js in Node** worked without surprises in the prototype (render, text
  layer, links, password detection, standard fonts). The remaining risk is
  breadth: unusual fonts, blend modes, huge scanned pages. Mitigation: a
  fixture set (embedded fonts, non-embedded standard fonts, a scanned page,
  CJK text, a form) from day one. Fallback is 7.1.
- **Untrusted PDFs in the Node process.** Covered by version floor,
  `isEvalSupported: false` and dependency updates (3.4).
- **Slow or hostile pages blocking the server.** A page that takes seconds to
  render would stall heartbeat and decision routes on the main thread.
  Mitigated by the render worker and its timeout (3.4), verified in the spike.
  Not covered yet: a single long native call (a huge embedded image decode),
  which `worker.terminate()` cannot interrupt; the fallback for that is a
  child process.
- **Package size.** About 35 MB unpacked for `pdfjs-dist`; optional, so
  markdown-only installs are unaffected.
- **Memory on large documents.** Thumbnails at their own scale, an LRU cache
  for full renders and `MAX_PAGES` bound it (3.4).
- **Outdated PDFs.** The agent edits the source and forgets to regenerate the
  PDF. Mitigated by the staleness check (3.6) and the loop instructions
  (3.11); without `--source`, annotaitr cannot detect it.
- **Page/slide mismatch with hidden slides.** No longer mapped; documented as
  a caveat for the agent, with quoted text as the fallback locator (3.9).
- **Prompt injection via document text.** Same treatment as page text from a
  captured URL: capped, quoted, labelled as document content.

## 6. Open questions

Each question carries a proposal; the design above already follows it where
it matters.

1. Thumbnail strip left (like Keynote/PowerPoint) or bottom (like the video
   timeline)? Left fits portrait pages better, bottom keeps one layout
   language across modes.
   **Proposal:** left. PDFs are often portrait, and Keynote, PowerPoint and
   Acrobat all place the strip there.
2. Should switching pages close an open comment popover?
   **Proposal:** yes. Switching with an unsaved comment text asks for
   confirmation or blocks until the comment is saved or discarded; a popover
   never stays open across pages.
3. Is `page` on a general comment enough, or should page comments be their
   own annotation type in the export format?
   **Proposal:** `type: 'comment'` with `page` is enough. The video mode
   already distinguishes timed and general comments by `time` alone.
4. Overview of touched pages only (current proposal) or the whole document
   with touched pages highlighted?
   **Proposal:** touched pages only. At 200 pages a whole-document sheet is
   too large to read and adds nothing the per-page images do not show.
5. Raise the Node floor to `>=22.13` (simple) or keep `>=22` and pin
   `pdfjs-dist` accordingly?
   **Proposal:** raise the floor to `>=22.13`. Pinning an older `pdfjs-dist`
   shuts out exactly the security updates 3.4 relies on.
6. Should `annotaitr deck.pptx` pick up a sibling `deck.pdf` automatically
   (same name, not older than the source) instead of printing the hint?
   Convenient, but implicit; the explicit `--source` keeps the contract
   obvious.
   **Proposal:** no automatic pick-up. When a fresh sibling `deck.pdf`
   exists, the hint prints the ready command with it instead of the generic
   one.
7. Should the hint exit `0` everywhere, or only with `--origin claude-code`?
   `0` avoids aborting slash commands; a person running the CLI by hand might
   expect a non-zero exit when nothing was opened.
   **Proposal:** `0` everywhere, consistent with the `[Image` chip hint. A
   person reads the text anyway, and one behaviour is easier to document.

## 7. Alternatives considered

### 7.1 Rendering in the browser

pdf.js is at home in the browser, and rendering there avoids the Node canvas
question. The server would then need the browser to upload rendered pages for
flattening, as the video mode already does with frames
(`POST /api/frame-plan`, `PUT /api/frames`). Rejected for S1 because it adds a
round trip and a second rendering path for the text layer, but it is the
fallback if Node rendering turns out badly.

### 7.2 Converting office formats inside annotaitr

Draft 2 designed a converter chain: LibreOffice, AppleScript for Keynote,
Pages, PowerPoint and Word, with workarounds for LibreOffice's
running-instance bug and always-zero exit code, for the Office and iWork
sandboxes, for macOS Automation consent (`-1743`) and for page-to-slide
mapping. Every one of those was real and researched, and together they made
conversion the most fragile and least testable part of the feature. Dropped
because the main use case does not need it: the agent that generated the deck
already renders it to PDF (section 2). If a non-agent use case ever needs
conversion, draft 2 in the git history has the full design.

### 7.3 Writing annotations into the PDF

Returning an annotated PDF with real PDF annotation objects would be nice for
humans, but agents read images, and the existing contract (annotated PNG plus
structured text) already works. Possible later as an extra export.

### 7.4 Poppler (`pdftoppm`, `pdftotext -bbox`)

Fast and robust, but an external binary on every platform, which the
optional-npm-dependency pattern avoids.

## 8. Changes

### From draft 3

- **Dispatch:** detection returns plain `{ mode: 'image' }`; `runImage()`
  branches to `runDocument()` as it does for video, and the office hint is
  handled in `main()` before detection like the `[Image` chip, not as a
  `hint` mode that `main()` would reject (3.2).
- **Flag validation:** `--source`/`--pages` only with a PDF,
  `--viewport`/`--delay` rejected with one (3.2).
- **Overview:** `composeContactSheet()` extended for mixed page sizes instead
  of reused unchanged (3.8).
- **Memory:** thumbnails rendered at their own scale, LRU cache for full
  renders, touched pages re-rendered on submit (3.4).
- **Event loop:** rendering moved into a worker with a timeout in S1, no
  longer deferred to S3 (3.4, 5).
- **Staleness check:** directory walk skips `node_modules`, `.git` and build
  output and is capped (3.6).
- **Content hash:** dropped from S1. The image client persists no annotation
  draft, so there was nothing for it to key; it returns with the first
  persisted state (3.7, 3.10, S3).
- **Text layer output:** link targets capped and quoted like text, own
  untrusted-content notice for documents, `POINT_REACH` checked against the
  render density (3.5).
- **Missing dependencies:** corrected the claim about markdown-only installs;
  the PDF runtime names `pdfjs-dist` in its error (3.4).
- **Open questions:** each now carries a proposal (6).

### From draft 2

- **Scope:** PDF is the only document input; all conversion moved out
  (former 3.8 replaced by 7.2).
- **New:** `CONVERT TO PDF FIRST:` hint for office formats (3.3), `--source`
  with staleness check (3.6).
- **Page versus slide:** explicit mapping dropped; documented caveat plus
  quoted text instead (3.9). The `yauzl`/`fflate` dependency for reading
  `presentation.xml` is gone with it.
- **Stages:** three instead of four; the hint and `--source` ship in S1.

## 9. Verification log

Prototype in a Linux container (Node 22.22, `pdfjs-dist` 6.4.299,
`@napi-rs/canvas` 1.0.10; test PDFs from LibreOffice 24.2 and reportlab):

| Check | Result |
|-------|--------|
| Modern build in Node | loads, warns to use the legacy build |
| Legacy build render, 16:9 slide at 2000px | 2000×1125 PNG, ~55 ms |
| `render({ canvas, viewport })` without `canvasContext` | works |
| Non-embedded Helvetica/Times without `standardFontDataUrl` | warning, substitute fonts |
| Same with `standardFontDataUrl` as file path | clean |
| Page background | opaque white |
| `getTextContent()` items | `str`/`transform`/`width`/`height`/`fontName`; bullets and empty items separate |
| `getAnnotations()` on a LibreOffice PDF | `Link` with `url` and `rect` |
| qpdf-encrypted PDF | `PasswordException`, `code` 1 |
| LibreOffice export of a deck with one hidden slide | hidden slide left out (3 of 4 pages) |
| `path.extname('deck.key/')` | `.key` |
| Anthropic `pptx` skill | renders decks to PDF via LibreOffice for visual QA and after every fix |

Worker spike (macOS arm64, Node 26.5, `pdfjs-dist` 6.4.299,
`@napi-rs/canvas` 1.0.x; fixtures generated with `pdf-lib`: a 16:9 slide, an
A4 portrait and an A4 landscape page with non-embedded Helvetica, and one
page with 400,000 filled rectangles):

| Check | Result |
|-------|--------|
| pdf.js legacy build and `@napi-rs/canvas` in `worker_threads` | load and render correctly |
| Page count and sizes from the worker, no rasterising | ~150 ms to first message including module load |
| 16:9 / A4 portrait / A4 landscape at 2000px | 2000×1125, 1413×2000, 2000×1413 in 43 to 57 ms |
| Same pages as thumbnails at 200px | 1 to 2 ms each |
| Text layer from the worker | strings correct, bullet run kept with its text |
| PNG buffer in the `postMessage` transfer list | `DataCloneError`, must be copied |
| Heavy page at 2000px, no timeout | 16.3 s in the worker; at 200px still 2.0 s |
| Heavy page, 3 s timeout | `worker.terminate()` returned after 95 to 624 ms, fresh worker served the next request |
| Main-thread event-loop lag during all of the above | at most 4 ms |

Not covered by the spike: Node 22.13 (only 26.5 was at hand), Linux and
Windows, and a single long native call inside a render.

Checked against the code (draft 4):

| Check | Result |
|-------|--------|
| `main()` dispatch | reads only `detected.mode`; `runImage()` re-detects video via `isVideoTarget()` |
| `[Image` chip | handled in `main()` before detection, exits `0` |
| `composeContactSheet()` | takes tile size from the first tile ("all frames share one size") |
| Image client persistence | settings as cookies only, no annotation draft |
| Element tool | offered whenever the element map is non-empty (`elements.length > 0`) |
| Heartbeat timeout | 30 s default (`server/core/config.js`) |
| `pdfjs-dist` registry metadata | 6.4.299, `engines: >=22.13.0 \|\| >=24`, optional `@napi-rs/canvas ^1.0.10` |

Sources:

- `pdfjs-dist` registry metadata (version, engines, optional dependencies,
  size)
- CVE-2024-4367: https://github.com/advisories/GHSA-wgrm-67xf-hhpq
- PowerPoint for Mac PDF export limits (hyperlinks):
  https://support.microsoft.com/en-au/powerpoint/training/save-powerpoint-presentations-as-pdf-files
- Keynote export options (`skipped slides`):
  https://macscripter.net/t/keynote-6-1-export-images/67130
- iWork package format: https://support.apple.com/guide/keynote/tanaa443947b/mac
