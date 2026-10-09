---
description: Present your code changes with explanations in the annotator before committing or opening a pull request
allowed-tools: Bash(git *), Bash(annotaitr *), Read, Write, Edit
args: base
---

## Present your changes

The user wants to see your changes explained before anything is committed or
pushed. Prepare a walkthrough, open it in annotaitr and act on the decision.
Do not commit, push or open a pull request before the user approves.

### 1. Collect the changes

- Base: `$ARGUMENTS` if given, else the default branch: `git symbolic-ref --short refs/remotes/origin/HEAD`, falling back to `main`, then `master`.
- Compare against the merge base, working tree included: `git merge-base <base> HEAD`, then `git diff --no-ext-diff --stat <merge-base>` and `git diff --no-ext-diff <merge-base>`.
- Untracked files count as changes: `git ls-files --others --exclude-standard`. Show each with `git diff --no-ext-diff --no-index /dev/null <file>`.
- No changes at all: tell the user and stop.

### 2. Write the walkthrough

Write it to `$(git rev-parse --git-path annotaitr)/changes.md`, inside the git
directory, so it is never committed and never shows up in the diff. Create the
directory if needed. Structure:

`````markdown
# <What the change does, as a title>

<Two to four sentences: what changed and why.>

**Compared:** `<branch>` against `<base>` (merge base `<short sha>`), working tree and untracked files included. <n> files, +<added> −<removed>.

**After approval:** `<proposed commit message, conventional commits format>`

## <path/of/file>

<One line: what changed in this file and why.>

<Optional one line for the next hunk.>

````diff <path/of/file>
<the hunks, copied verbatim from git diff, starting at the first @@ line>
````
`````

Rules for the walkthrough:

- **Every changed file gets a section**, ordered by path like a file tree, untracked files included. A file you consider trivial still gets its one line.
- **One `diff <path>` block per file** with all its hunks, the path after `diff` on the fence line, so annotaitr shows it as a file card with line numbers. Fence it with four backticks (` ```` `), or more if the hunk itself holds a run of four, so a code fence inside the changed file cannot end the block early. To explain a single hunk, split the file into several blocks, each with the same path and its one line above it.
- **Copy hunks verbatim** from the `git diff` output. Never shorten, reformat or rewrite them. The reviewer must see exactly what will be committed. For a binary file, a file over 300 changed lines, or a lock file, name it with its `--stat` line instead of the hunks.
- Explain intent, not syntax. Do not repeat what the diff already shows.
- Mention anything the reviewer might not expect, such as a changed config, a removed test or a new dependency, in the summary.

### 3. Open it

Run `annotaitr --origin claude-code <walkthrough path>` with the Bash tool and
`run_in_background: true`, since it blocks until the user decides. Tell the
user in one line that the walkthrough is open and end your turn. When the
command finishes, read its output.

### 4. Act on the decision

- `APPROVED:`: commit the changes with the proposed message. Stage only the files listed in the walkthrough. Push or open a pull request only if the user asked for that in this conversation.
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

After the changes, collect the diff again (step 1) and rewrite the walkthrough
from scratch. Open it with notes on what you did, one per handle, each
starting with the handle and a few words naming the passage:

```bash
annotaitr --origin claude-code --feedback-notes '[{"text":"#a3f19c2e (cache key): now injected through the constructor"}]' <walkthrough path>
```

Repeat until the user approves, then act as in step 4. Delete the walkthrough
file once the changes are committed or the user stops the review.
