---
description: Open a Markdown file in the browser-based annotator for review
allowed-tools: Bash(annotaitr *), Read, Edit
args: files
---

## Markdown Annotations

!`annotaitr --origin claude-code $ARGUMENTS`

## Your task

Address the annotation feedback above. The user has reviewed the markdown file in the browser UI and provided specific annotations:

Each heading names the note's number, its intent and what it points at, such
as `## 3. Question · Text (Line 7) [#a3f19c2e]`. The intent says what to do:

- **Change**: apply the user's comment as a change to the quoted text
- **Add**: an `Insertion` inserts the given text after its `After:` context; on a quoted text, add what the comment asks for there
- **Remove**: delete the quoted text (a comment, if there is one, says what exactly)
- **Question**: the user asks, they do not request an edit. Answer it when you report back, and change the file only if the answer makes the change obvious

A `General comment` has no number and no intent. A note keeps its number for
the whole round: numbers can have gaps where the user deleted a note, and the
notes are listed in document order, not by number. The handle at the end of
the heading stays fixed for as long as the annotation exists. Use it whenever you
refer to a specific annotation. The reviewer never sees handles in the
annotator, so pair each one with a few words naming the passage: "fixed
`#a3f19c2e` (intro wording), left `#7b210e44` (install steps) alone because the
intro already covers it". If a heading carries no handle, refer to that
annotation by its number and quoted text instead, and never invent one.

If the output shows `APPROVED:`, the user approved the file with no changes needed — confirm and stop.

If the output shows `APPROVED WITH NOTES:`, the user approved the file as-is but left annotations. Do **not** edit the file. Read the notes, acknowledge them, and stop — they are context for your understanding, not change requests.

## Re-review loop

After applying all changes:

1. **Reply per handle.** The feedback ends with a `Session:` line. Run one `annotaitr reply --session <id> --to <handle> --status <status> --text "..."` per handle, with `<status>` one of `applied`, `partial`, `declined`, `deferred` or `question`. The text says what changed, what is left, why you declined, when you will do it, or the question; ask a blocking question in chat too. A `## Replies to round N` section continues an earlier thread: act on the reviewer's reply and answer it on the same handle. A `Feedback: N replies to round N, no new marks.` decision is a valid decision with work in it.

2. **Re-open the annotator** on the same files. The next round shows your replies next to the reviewer's notes. Add `--feedback-notes` only for notes tied to no handle, such as a summary of the changes; each has a `text` field and an optional `line` field (line number in the **updated** file):
   ```bash
   annotaitr --origin claude-code <file1.md> [file2.md ...]
   annotaitr --origin claude-code --feedback-notes '[{"text":"Split the install section into two steps","line":12}]' README.md
   ```

3. **Evaluate the result:**
   - `APPROVED:` → The user is satisfied. Done.
   - `APPROVED WITH NOTES:` → The user is satisfied. Summarize the notes without editing. Done.
   - More feedback → Apply changes and repeat from step 1.
