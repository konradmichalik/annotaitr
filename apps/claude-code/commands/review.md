---
description: Open a target in the browser-based annotator, auto-detecting whether it's an image or a Markdown/plain-text file
allowed-tools: Bash(annotaitr *), Read, Edit
args: target
---

## Annotations

!`setopt no_bad_pattern no_nomatch 2>/dev/null; annotaitr --origin claude-code $ARGUMENTS`

If no target is given, this reads the current image from the macOS clipboard,
so `/annotaitr:review` alone works right after copying a screenshot, no need
to save it to a file first.

`$ARGUMENTS` is passed to the shell as typed, unquoted. A path containing
spaces (macOS screenshots are named that way by default) needs quotes typed
around it: `/annotaitr:review "~/Desktop/Screenshot 2026-01-01 at 12.00.00.png"`.

If the output above starts with `PASTED CHAT IMAGE:`, the user passed an
`[Image #N]` chip for an image pasted or dropped into the chat. Find the
`[Image: source: <path>]` line for that image in this conversation and run
`annotaitr --origin claude-code '<path>'` with the Bash tool and
`run_in_background: true`, since it blocks until the user submits. Tell the
user in one line that the annotator is open and end your turn; when the
command finishes, read its output and handle it as described below. Only one
image can be opened at a time: if several chips were given, ask which one. If
no source line exists, ask the user to save the image or copy it to the
clipboard.

Use this command when you don't know in advance whether `$ARGUMENTS` is an
image target or a markdown target — `annotaitr` auto-detects it (see `--help`
for the exact rules) and the output above will be in one of two shapes:

**Image feedback** — recognizable by an `Annotated screenshot:` path near the
top. The user marked up an image or captured web page: boxes, arrows,
freehand marks, highlighter marks, and numbered comment pins, each with an
optional comment. An arrow in dimension-line style (ticks, no arrowhead)
marks a distance or spacing rather than pointing at a single target.
Read the annotated image directly to see exactly what was marked and where;
combine that with each annotation's coarse position and comment text to find
the relevant source and apply the requested change.

**Markdown feedback** — a `# Annotation Feedback` document (or `APPROVED:` /
`APPROVED WITH NOTES:` with no such document) with one block per annotation,
each giving a line reference and the requested change:

- **"Remove this"** entries: delete the quoted text
- **"Comment on"** entries: apply the comment as a change to the referenced text
- **"Insert text"** entries: insert the given text at the specified location

In both shapes, an annotation heading normally carries a short handle in
brackets, such as `[#a3f19c2e]`. The number is positional and is recalculated
on every export, the handle stays fixed for as long as the annotation exists.
Use it whenever you refer to a specific annotation when reporting back to the
user. The reviewer never sees handles in the annotator, so pair each one with a
few words naming the passage: "fixed `#a3f19c2e` (intro wording), left
`#7b210e44` (install steps) alone because the intro already covers it". In
markdown reviews, also start each feedback note with the handle of the
annotation it answers; image mode has no feedback notes. If a heading carries
no handle, refer to that annotation by its number and quoted text instead, and
never invent one.

In both shapes: if the output shows `APPROVED:`, the target was approved with
no changes needed — confirm and stop. If it shows `APPROVED WITH NOTES:`, it
was approved as-is but carries annotations; do **not** make changes, read the
notes as context, and stop.

## Re-review loop

After applying all changes, re-open the annotator on the same target (for
markdown, add `--feedback-notes` describing what changed, as in
`/annotaitr:md`; for an image or URL, just re-run) and repeat until
`APPROVED:` or `APPROVED WITH NOTES:`.
