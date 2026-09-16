---
description: Annotate a markdown file in the browser
---

Use the `annotate_markdown` tool to open the specified file for interactive review.

**Arguments:** $ARGUMENTS

If arguments contain file path(s), use those files.
Otherwise, ask the user which markdown file they want to annotate.

The user can:
- Select text and mark it for deletion
- Select text and add comments
- Insert text at specific locations
- Approve the file with no changes

After the user submits their decision:
- If approved: No action needed
- If feedback provided: Apply the requested changes to the file

Each annotation heading ends with a short handle in brackets, such as
`[#a3f19c2e]`. The numbering is recalculated every round, the handle is not.
Use it whenever you refer to a specific annotation, both when reporting back to
the user and in the next round's feedback notes.

## Re-review loop

Unless the user specified `--no-review`, after applying changes:

1. Create feedback notes describing what you changed:
   - Use `feedbackNotes` parameter with `[{text, line?}]` entries
   - Include `line` for location-specific notes (use line numbers from the **updated** file)
   - Omit `line` for general notes
   - Quote the handle of the annotation a note answers

2. Re-open the annotator with notes:
   ```
   annotate_markdown({ filePath: "...", feedbackNotes: [{text: "#a3f19c2e: changed X", line: 5}] })
   ```

3. If approved → done. If more feedback → apply and repeat.
