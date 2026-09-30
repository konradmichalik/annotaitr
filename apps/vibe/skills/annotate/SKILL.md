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
- Structured annotation feedback → apply the requested edits to the file(s):
  - **"Remove this"** entries: delete the quoted text.
  - **"Comment on"** entries: apply the user's comment as a change to the referenced text.
  - **"Insert text"** entries: insert the provided text at the specified location.

Each annotation heading normally ends with a short handle in brackets, such as
`[#a3f19c2e]`. The number is positional and is recalculated on every export,
the handle stays fixed for as long as the annotation exists. Use it whenever you
refer to a specific annotation. The reviewer never sees handles in the
annotator, so pair each one with a few words naming the passage. If a heading
carries no handle, refer to that annotation by its number and quoted text
instead, and never invent one.

> Requires the `annotaitr` CLI on your `PATH` (`npm install -g annotaitr`,
> or `npm link` from a local checkout). `md-annotator` still works as a
> compatibility alias for the same binary.

## Re-review loop

Unless the user said otherwise, after applying all changes:

1. **Build feedback notes** describing what you changed — a JSON array of
   `{ "text": "...", "line": <number> }` entries. `line` is the line number in
   the **updated** file; omit it for general notes. Start each note with the
   handle of the annotation it answers and a few words naming the passage. The
   reviewer's original marks are usually gone in the next round, so a bare
   handle means nothing to them.

2. **Re-open the annotator** with the notes so the user sees what changed:

   ```bash
   annotaitr --origin vibe --feedback-notes '[{"text":"#a3f19c2e (intro): rewrote for clarity","line":5},{"text":"#7b210e44 (install steps): left as-is, the section is referenced elsewhere"}]' <file1.md> [file2.md ...]
   ```

3. **Evaluate the result:**
   - `APPROVED:` → the user is satisfied. Done.
   - `APPROVED WITH NOTES:` → the user is satisfied. Summarize the notes without editing. Done.
   - More feedback → apply the changes and repeat from step 1.
