---
description: Open an image file or a captured web page in the browser-based annotator for visual review
allowed-tools: Bash(annotaitr *), Read, Edit
args: target
---

## Image Annotations

!`annotaitr --origin claude-code $ARGUMENTS`

If no target is given, this reads the current image from the macOS clipboard
(the same source a pasted screenshot would use), so `/annotaitr:image` alone
works after copying a screenshot without needing to save it to a file first
(a pasted chat image is not the same thing and does not work as a target
here).

`$ARGUMENTS` is passed to the shell as typed, unquoted. A path containing
spaces (macOS screenshots are named that way by default) needs quotes typed
around it: `/annotaitr:image "~/Desktop/Screenshot 2026-01-01 at 12.00.00.png"`.

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
  but is renumbered every round; the handle is stable. Use the handle when you
  report back which annotations you addressed: "fixed `#a3f19c2e`, left
  `#7b210e44` alone because that spacing is intentional". If a heading carries
  no handle, refer to that annotation by its number instead, and never invent
  one.
- Combine what you see in the image with the comment text and position to
  find the relevant source (search the repo for matching visible text, class
  names, or component structure) and apply the requested change.

If the output shows `APPROVED:`, the user approved the page with no changes
needed: confirm and stop.

If the output shows `APPROVED WITH NOTES:`, the user approved the page as-is
but left annotations. Do **not** make changes. Read the notes, acknowledge
them, and stop. They are context for your understanding, not change
requests.

## Re-review loop

After applying all changes, re-open the annotator on the same target (a URL
re-captures live; a file path re-loads the same image) to confirm the fix
looks right, then repeat until `APPROVED:` or `APPROVED WITH NOTES:`.
