# Images and screenshots

A local image (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`) or the macOS clipboard is annotated as it is. Shared flags, session handling and the output format are in the [CLI reference](../usage.md).

```bash
annotaitr ./mockup.png
annotaitr ./diagram.svg
annotaitr                 # clipboard, macOS only
```

Pass several image files to review them in one session:

```bash
annotaitr ./mobile.png ./tablet.png ./desktop.png
```

![An image in the dark theme with a note being written](../../site/images/06-image-dark.png)

## Clipboard

Run `annotaitr` with no target to annotate the image on the macOS clipboard. A screenshot pasted into a Claude Code chat works too: the plugin commands look up the saved file and pass its path. A clipboard image has no identity to find, so a later round continues only with `--session <id>`.

## SVG files

An `.svg` target is rendered to a PNG before the annotator opens, so it is
annotated like any other image. The renderer runs no scripts and loads no
external resources. The longer side is rendered at the declared size, but at
least 1600px and at most 8000px: icons are scaled up, oversized drawings
scaled down, both as vectors without loss. Transparent areas get a white
background. The SVG needs a `width`/`height` in px (or unitless) or a
`viewBox`, otherwise it has no size to render at and is rejected.

## Several images

A set of image files opens in one annotator with a thumbnail strip to switch between them. Each image keeps its own notes and its own numbering, and one decision covers the whole set. The output lists the notes per image under `## Image N of M: <path>`, with one annotated screenshot per image that has notes.

A set takes local image files only. URLs, the clipboard, videos and PDFs stay single-target, and a set starts no [review session](sessions.md), so `--session` and `--new-session` do not apply.
