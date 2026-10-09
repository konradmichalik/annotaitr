---
description: Present your code changes with explanations in the annotator before committing or opening a pull request
allowed-tools: Bash(git *), Bash(annotaitr *), Read, Write, Edit
args: base
---

## Present your changes

The user wants to see your changes explained before anything is committed or
pushed. You write the explanation, annotaitr adds the real diff from git and
opens it. Do not commit, push or open a pull request before the user approves.

### 1. Check what changed

You usually know your changes already. Run `git status --short` (or
`git diff --stat <base>...HEAD` with a base) so no file is missed, and read a diff only where you are unsure what it holds. Do not copy
any diff anywhere: annotaitr reads it from git itself.

### 2. Write the explanation

Write a JSON file to `$(git rev-parse --git-path annotaitr)/explain.json`,
inside the git directory, so it is never committed. Create the directory if
needed.

```json
{
  "title": "What the change does",
  "summary": "Two to four sentences: what changed and why. Mention anything unexpected, such as a changed config, a removed test or a new dependency.",
  "commit": "type: proposed commit message in conventional commits format",
  "files": {
    "path/from/repo/root.ext": "One line: what changed in this file and why."
  }
}
```

Give every changed file one line, keyed by its path from the repository root,
untracked files included. A file without a line is shown as `Not explained`.
Explain intent, not syntax.

### 3. Open it

Run `annotaitr changes --origin claude-code --explain <explain.json path>`
with the Bash tool and `run_in_background: true`, since it blocks until the
user decides. Without a base it shows the uncommitted changes against `HEAD`,
untracked files included, which is the review before a commit. Add
`--base $ARGUMENTS` if a base was given, or `--base <target branch>` when the
user wants the whole branch reviewed before a pull request. Tell the user in one line that the walkthrough is
open and end your turn. When the command finishes, read its output.

`NO CHANGES:` means there is nothing to present: tell the user and stop. An
`Error:` names what to fix in the explanation file or the base.

### 4. Act on the decision

- `APPROVED:`: commit with the proposed message. Stage only the files of the walkthrough. Push or open a pull request only if the user asked for that in this conversation.
- `APPROVED WITH NOTES:`: commit as above. Treat the notes as context, mention them briefly, change nothing because of them.
- Annotation feedback: revise, then present again (step 5). Do not commit.

Each feedback heading names the note's number and intent, such as
`## 3. Question · Text (Lines 40-42) [#a3f19c2e]`. Its line numbers refer to
the walkthrough, not to the source. Find the place in the source from the
quoted text and the `## <path>` section it sits in: `+` lines are the new
code, `-` lines the old one, and a quote from your own explanation refers to
the explanation or the commit message.

- **Change**: apply the comment to the quoted code or text
- **Add**: add what the comment asks for there; an `Insertion` gives the text to insert after its `After:` context
- **Remove**: remove the quoted code or text
- **Question**: answer it when you report back, and change something only if the answer makes the change obvious

A `General comment` has no number and no intent. Refer to a note by its handle
plus a few words naming the passage, as in "fixed `#a3f19c2e` (cache key)".

### 5. Present again

After the changes, update the explanation file and open it again with notes on
what you did, one per handle, each starting with the handle and a few words
naming the passage:

```bash
annotaitr changes --origin claude-code --explain <explain.json path> --feedback-notes '[{"text":"#a3f19c2e (cache key): now injected through the constructor"}]'
```

Repeat until the user approves, then act as in step 4. Delete `explain.json`
and `changes.md` in that directory once the changes are committed or the user
stops the review.
