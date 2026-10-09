# Migrating from md-annotator

`annotaitr` is the successor to `md-annotator` (this repo, formerly
`konradmichalik/md-annotator`), extended with image and captured-web-page
review alongside the existing Markdown/plain-text review, and
auto-detecting which mode to run from the target. Nothing below is
required to keep working today (the old names and variables still
function, with a deprecation warning), but plan to move off them before
the next major version.

## Claude Code

The marketplace and the plugin were both renamed. Remove the old
installation and add the new one:

```bash
claude plugin marketplace remove md-annotator
claude plugin uninstall annotate@md-annotator
claude plugin marketplace add konradmichalik/annotaitr
claude plugin install annotaitr@annotaitr
```

The commands themselves are renamed too: `/annotate:md` is now
`/annotaitr:md`. `/annotaitr:img` and `/annotaitr:review` are new.

## CLI

```bash
npm install -g annotaitr
```

`md-annotator` keeps working as a `bin` alias for existing scripts and
shell aliases.

## Environment variables

`MD_ANNOTATOR_*` still works, with a one-time deprecation warning on
stderr, under the merged `ANNOTAITR_*` prefix. See the full list in
[Usage](usage.md#environment-variables).

## Signal handling

Interrupting a markdown-mode session (`Ctrl+C`) now reports `{ aborted: true
}` to the calling agent instead of the previous `{ approved: true }`, so an
interrupt is no longer indistinguishable from a real approval.

## OpenCode and Vibe

`md-annotator-opencode` is now `annotaitr-opencode`; the Vibe skill
directory is now `apps/vibe/skills/annotate`. Both stay markdown-only for
now: image support in either is tracked as a follow-up, not yet available.
