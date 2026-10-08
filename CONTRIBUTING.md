# Contributing

## Getting started

```bash
git clone https://github.com/konradmichalik/annotaitr.git
cd annotaitr
npm install && npm run build
```

See [docs/development.md](docs/development.md) for the full command
reference, local Claude Code / OpenCode plugin testing, and the client
dev-server workflow. UI changes follow the design rules in
[docs/design/rules.md](docs/design/rules.md) and the
[reference screens](docs/design/screens.md).

## Tests and linters

```bash
npm test          # unit and integration tests (vitest)
npm run test:e2e  # Playwright end-to-end tests
npm run lint      # ESLint + Stylelint
```

All three run in CI on every pull request; a failing check blocks merge.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>: <description>
```

`type` is one of `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`,
`ci`, or `release`. One commit per logical change.

## Pull requests

Target `main`. Describe what changed and why, not just what files moved.
Once CI is green, a maintainer reviews and merges: expect follow-up
questions on anything that changes the public CLI surface (flags,
environment variables, plugin commands), since those are covered by
[docs/usage.md](docs/usage.md) and the guides in `docs/usage/`, and need to stay in sync.

## Releasing

Maintainer-only; see [docs/release.md](docs/release.md).
