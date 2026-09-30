---
description: Open a Markdown file in the browser-based annotator for review
allowed-tools: Bash(annotaitr *), Read, Edit
args: files
---

## Markdown Annotations

!`annotaitr --origin claude-code $ARGUMENTS`

## Your task

Address the annotation feedback above. The user has reviewed the markdown file in the browser UI and provided specific annotations:

- **"Remove this"** entries: Delete the quoted text from the file
- **"Comment on"** entries: Apply the user's comment as a change to the referenced text
- **"Insert text"** entries: Insert the provided text at the specified location

Each heading normally ends with a short handle in brackets, such as
`[#a3f19c2e]`. The number is positional and is recalculated on every export,
the handle stays fixed for as long as the annotation exists. Use it whenever you
refer to a specific annotation. The reviewer never sees handles in the
annotator, so pair each one with a few words naming the passage: "fixed
`#a3f19c2e` (intro wording), left `#7b210e44` (install steps) alone because the
intro already covers it". If a heading carries no handle, refer to that
annotation by its number and quoted text instead, and never invent one.

If the output shows `APPROVED:`, the user approved the file with no changes needed — confirm and stop.

If the output shows `APPROVED WITH NOTES:`, the user approved the file as-is but left annotations. Do **not** edit the file. Read the notes, acknowledge them, and stop — they are context for your understanding, not change requests.

## Re-review loop

After applying all changes:

1. **Build feedback notes JSON** describing what you changed. Each note has a `text` field and an optional `line` field (line number in the **updated** file). Omit `line` for general notes. Start each note with the handle of the annotation it answers and a few words naming the passage. The reviewer's original marks are usually gone in the next round, so a bare handle means nothing to them.

2. **Re-open the annotator** with inline notes:
   ```bash
   annotaitr --origin claude-code --feedback-notes '<JSON_ARRAY>' <file1.md> [file2.md ...]
   ```
   Example:
   ```bash
   annotaitr --origin claude-code --feedback-notes '[{"text":"#a3f19c2e (intro): rewrote for clarity","line":5},{"text":"#7b210e44 (install steps): left as-is, the section is referenced elsewhere"}]' README.md
   ```

3. **Evaluate the result:**
   - `APPROVED:` → The user is satisfied. Done.
   - `APPROVED WITH NOTES:` → The user is satisfied. Summarize the notes without editing. Done.
   - More feedback → Apply changes and repeat from step 1.
