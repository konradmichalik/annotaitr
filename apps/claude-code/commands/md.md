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

Each heading ends with a short handle in brackets, such as `[#a3f19c2e]`. The
numbering is positional and is recalculated every round, the handle is not. Use
it whenever you refer to a specific annotation, both when reporting back to the
user and in the next round's feedback notes: "fixed `#a3f19c2e`, left
`#7b210e44` alone because the intro already covers it".

If the output shows `APPROVED:`, the user approved the file with no changes needed — confirm and stop.

If the output shows `APPROVED WITH NOTES:`, the user approved the file as-is but left annotations. Do **not** edit the file. Read the notes, acknowledge them, and stop — they are context for your understanding, not change requests.

## Re-review loop

After applying all changes:

1. **Build feedback notes JSON** describing what you changed. Each note has a `text` field and an optional `line` field (line number in the **updated** file). Omit `line` for general notes. Quote the handle of the annotation a note answers, so the user can tell which of their marks you are replying to.

2. **Re-open the annotator** with inline notes:
   ```bash
   annotaitr --origin claude-code --feedback-notes '<JSON_ARRAY>' <file1.md> [file2.md ...]
   ```
   Example:
   ```bash
   annotaitr --origin claude-code --feedback-notes '[{"text":"#a3f19c2e: rewrote intro for clarity","line":5},{"text":"#7b210e44: left as-is, the section is referenced elsewhere"}]' README.md
   ```

3. **Evaluate the result:**
   - `APPROVED:` → The user is satisfied. Done.
   - `APPROVED WITH NOTES:` → The user is satisfied. Summarize the notes without editing. Done.
   - More feedback → Apply changes and repeat from step 1.
