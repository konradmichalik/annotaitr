# PDFs

A PDF is reviewed page by page. Shared flags, session handling and the output format are in the [CLI reference](../usage.md).

![annotaitr reviewing a PDF: numbered marks on the page, a dock of tools at the bottom and a feedback panel](../../site/images/01-pdf.png)

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
