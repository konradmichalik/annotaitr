---
description: Open an image file, a captured web page, a video or a GIF in the browser-based annotator for visual review
allowed-tools: Bash(annotaitr *), Read, Edit
args: target
---

## Image Annotations

!`setopt no_bad_pattern no_nomatch 2>/dev/null; annotaitr --origin claude-code $ARGUMENTS`

If no target is given, this reads the current image from the macOS clipboard,
so `/annotaitr:image` alone works after copying a screenshot without needing
to save it to a file first.

`$ARGUMENTS` is passed to the shell as typed, unquoted. A path containing
spaces (macOS screenshots are named that way by default) needs quotes typed
around it: `/annotaitr:image "~/Desktop/Screenshot 2026-01-01 at 12.00.00.png"`.

## Pasted chat images

If the output above starts with `PASTED CHAT IMAGE:`, the user passed an
`[Image #N]` chip for an image pasted or dropped into the chat. The shell runs
before the image's path is known, so open it yourself:

1. Find the `[Image: source: <path>]` line for that image in this
   conversation.
2. Run `annotaitr --origin claude-code '<path>'` with the Bash tool and
   `run_in_background: true`, since it blocks until the user submits.
3. Tell the user in one line that the annotator is open, then end your turn.
   When the background command finishes, read its output and continue with
   the task below.

Image mode takes exactly one image. If several chips were given, ask which one
to open. If no source line exists for the chip, say so and ask the user to
save the image or copy it to the clipboard instead.

## Your task

Address the annotation feedback above. The user marked up an image in the
browser UI: boxes, arrows, freehand marks, highlighter marks, and numbered
comment pins, each with an optional text comment. An arrow drawn in
dimension-line style (perpendicular ticks, no arrowhead) marks a distance or
spacing between two points rather than pointing at a single target.

- The output includes a path to an **annotated image** (the original
  image with the markup baked in as pixels). Read that image directly to
  see exactly what was marked and where.
- Each annotation lists its type, a coarse position (e.g. "top right, ~15%
  from top, ~85% from left"), and its comment text.
- Each heading normally carries a short handle in brackets after the number,
  such as `### 1. [#a3f19c2e]`. The number matches the marker drawn in the image
  and is positional, the handle stays fixed for as long as the annotation
  exists. Use the handle when you report back which annotations you addressed.
  The reviewer never sees handles in the annotator, so pair each one with a few
  words naming the spot: "fixed `#a3f19c2e` (header spacing), left `#7b210e44`
  (footer gap) alone because that spacing is intentional". If a heading carries
  no handle, refer to that annotation by its number instead, and never invent
  one.
- Combine what you see in the image with the comment text and position to
  find the relevant source (search the repo for matching visible text, class
  names, or component structure) and apply the requested change.

### Video and GIF feedback

A video or GIF target (`.mp4`, `.m4v`, `.webm`, `.mov`, `.gif`) produces
feedback that opens with `on the recording <name>` instead of an annotated
screenshot. You cannot watch the video, so it hands you stills instead:

- `Overview:` is a contact sheet of twelve frames across the whole recording,
  with annotation numbers on the nearest frame. Read it first to follow the
  flow.
- Each timed annotation is `at <mm:ss.mmm>` or `from <start> to <end>` and
  names its `Frame:`, the frame it was drawn on with the markup baked in.
  Read that frame the same way as an annotated screenshot.
- A span also names a `Strip:` of six frames across it. Read it to see what
  changes over the span (an element that flickers, moves or never stops
  loading).
- `General comment about the whole recording` has no frame.

Re-running on the same file reopens the same recording. If the fix only
shows in a new recording, say so instead of re-opening the old one.

If the output shows `APPROVED:`, the user approved the page with no changes
needed: confirm and stop.

If the output shows `APPROVED WITH NOTES:`, the user approved the page as-is
but left annotations. Do **not** make changes. Read the notes, acknowledge
them, and stop. They are context for your understanding, not change
requests.

## Re-review loop

After applying all changes, re-open the annotator on the same target (a URL
re-captures live; a file path, including a pasted image's path, re-loads the
same image) to confirm the fix
looks right, then repeat until `APPROVED:` or `APPROVED WITH NOTES:`.
