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

Each annotation heading normally ends with a short handle in brackets, such as
`[#a3f19c2e]`. The number is positional and is recalculated on every export,
the handle stays fixed for as long as the annotation exists. Use it whenever you
refer to a specific annotation. The reviewer never sees handles in the
annotator, so pair each one with a few words naming the passage. If a heading
carries no handle, refer to that annotation by its number and quoted text
instead, and never invent one.

## Re-review loop

Unless the user specified `--no-review`, after applying changes:

1. Create feedback notes describing what you changed:
   - Use `feedbackNotes` parameter with `[{text, line?}]` entries
   - Include `line` for location-specific notes (use line numbers from the **updated** file)
   - Omit `line` for general notes
   - Start each note with the handle it answers and a few words naming the passage, since the reviewer never sees handles in the annotator

2. Re-open the annotator with notes:
   ```
   annotate_markdown({ filePath: "...", feedbackNotes: [{text: "#a3f19c2e (intro): changed X", line: 5}] })
   ```

3. If approved → done. If more feedback → apply and repeat.
