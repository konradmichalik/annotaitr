---
name: annotate
description: Open Markdown file(s) in the browser-based annotaitr for interactive review, then apply the user's annotation feedback.
user-invocable: true
---

# Annotate Markdown

Open one or more Markdown files in the annotaitr browser UI so the user can
review them — selecting text to mark deletions, adding comments, or inserting
text — then apply the feedback they submit. (Image and captured-web-page
review are also part of `annotaitr`, but not exposed through this skill yet.)

**Arguments:** `$ARGUMENTS`

If the arguments contain Markdown file path(s), use those. Otherwise, ask the
user which Markdown file they want to annotate.

## Run the annotator

Run the `annotaitr` CLI with your shell tool, passing `--origin vibe` and the
file path(s). This command **blocks** until the user submits a decision in the
browser:

```bash
annotaitr --origin vibe <file1.md> [file2.md ...]
```

The command prints the result to stdout:

- `APPROVED:` → the user approved the file with no changes. Confirm and stop.
- `APPROVED WITH NOTES:` → the user approved the file as-is but left annotations.
  Do **not** edit the file; read the notes as context, acknowledge them, and stop.
- Nothing on stdout and exit code 1 (`No decision made.` on stderr) → the user
  closed the tab or interrupted the review. That is not an approval: change
  nothing and ask what they want.
- Structured annotation feedback → apply the requested edits to the file(s).
  Each heading names the note's number and what it points at, such as
  `## 3. Text (Line 7) [#a3f19c2e]`. A note is a comment or a removal:
  - **Remove**: the heading says `Remove ·` after the number. Delete the quoted text.
  - **Comment**: every other note. Its text says what the user wants: a change to the quoted text, something to add there, or a question. An `Insertion` comments at a position, with the `After:` context before it, and if it says to add something, add it there. A question is not a request for an edit: answer it, and change the file only if the answer makes the change obvious.
  - An `Attachment:` line under a heading names an image the user attached to that note. You cannot open images, so tell the user which note has one you could not view.

A `General comment` has no number. A note keeps its number for
the whole round, so numbers can have gaps where the user deleted a note, and
notes are listed in document order. Each heading normally ends with a short
handle in brackets, such as `[#a3f19c2e]`, which stays fixed for as long as
the annotation exists. Use it whenever you
refer to a specific annotation. The reviewer never sees handles in the
annotator, so pair each one with a few words naming the passage. If a heading
carries no handle, refer to that annotation by its number and quoted text
instead, and never invent one.

> Requires the `annotaitr` CLI on your `PATH` (`npm install -g annotaitr`,
> or `npm link` from a local checkout). `md-annotator` still works as a
> compatibility alias for the same binary.

## Re-review loop

Unless the user said otherwise, after applying all changes:

1. **Reply per handle.** The feedback ends with a `Session:` line. Run one
   `annotaitr reply --session <id> --to <handle> --status <status> --text "..."`
   per handle, `<status>` one of `applied`, `partial`, `declined`, `deferred`
   or `question`. The text says what changed, what is left, why you declined,
   when you will do it, or the question. A `## Replies to round N` section
   continues an earlier thread: act on the reviewer's reply and answer it on
   the same handle.

2. **Re-open the annotator** on the same files, so the user sees your replies
   next to their notes. Add `--feedback-notes` (a JSON array of
   `{ "text": "...", "line": <number> }`, `line` in the **updated** file) only
   for notes tied to no handle, such as a summary of the changes:

   ```bash
   annotaitr --origin vibe <file1.md> [file2.md ...]
   annotaitr --origin vibe --feedback-notes '[{"text":"Split the install section into two steps","line":12}]' <file.md>
   ```

3. **Evaluate the result:**
   - `APPROVED:` → the user is satisfied. Done.
   - `APPROVED WITH NOTES:` → the user is satisfied. Summarize the notes without editing. Done.
   - More feedback → apply the changes and repeat from step 1.
