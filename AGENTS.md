# AGENTS.md

## Project overview

annotaitr is a plugin and CLI for Claude Code, OpenCode and Mistral Vibe. It opens an image, a captured web page, a video, a PDF or Markdown/plain-text files in a browser UI for annotation. The user's feedback is printed to stdout for the calling agent to apply. Requires Node.js 22.13 or newer.

The mode (`image` or `markdown`) is auto-detected from the CLI target by `detectMode()` in `index.js`, or forced with `--as`.

Flow: CLI (`index.js`) starts an Express server, opens the browser and blocks until the user submits a decision. Each client is a React SPA built as one single-file HTML bundle (vite-plugin-singlefile).

Stdout is the contract with the calling agent:
- `APPROVED: ...` means no changes needed
- `APPROVED WITH NOTES: ...` means approved as-is, the notes are context and not change requests
- Structured annotation blocks mean the agent applies edits (markdown mode) or matches notes to the annotated screenshot (image mode)

## Structure

- `index.js`: CLI entry, argument parsing, mode detection, stdout output
- `server/core/`: mode-agnostic Express bootstrap, config (`ANNOTAITR_*` environment variables), browser opening, signal handling
- `server/markdown/`, `server/image/`: mode-specific API routes, feedback formatting, file and image loading
- `client/markdown/`, `client/image/`: the two React SPAs with separate Vite roots
- `client/shared/`: components, hooks and utils used by both clients
- `apps/claude-code/`: Claude Code plugin (`.claude-plugin/plugin.json`, slash commands `md`, `image`, `review`)
- `apps/opencode/`: OpenCode plugin (`index.ts`, bundled with tsup)
- `apps/vibe/skills/annotate/`: Mistral Vibe skill
- `.claude-plugin/marketplace.json`: plugin marketplace manifest
- `test/`: unit and integration tests (vitest) and `test/e2e/` (Playwright)
- `scripts/`: install script and Vite helper plugin
- `docs/`: usage, development, how-it-works, migration and release docs

## Development commands

```bash
npm install
npm run build              # build both clients, required before the first run
npm run dev                # CLI with node --watch
npm run dev:client         # Vite dev server, markdown client
npm run dev:client:image   # Vite dev server, image client
node index.js <target>     # run the CLI directly
```

Point a dev server at a running backend with `ANNOTAITR_NO_OPEN=1 node index.js <target>`. See `docs/development.md` for local plugin testing.

## Testing

```bash
npm test                   # vitest unit and integration tests
npm run test:coverage      # with coverage
npm run test:e2e           # Playwright, needs `npm run build` and Chromium
```

CI runs `npm test` and the E2E suite (after `npm run build` and `npx playwright install --with-deps chromium`) on every pull request.

## Code style and linting

```bash
npm run lint               # ESLint and Stylelint
npm run lint:fix
```

- ESLint (`eslint.config.js`) covers JS and JSX, Stylelint (`stylelint.config.js`, standard config) covers CSS
- CI runs `npm run lint:js` and `npm run lint:css` as separate jobs
- The image server and client share no modules on purpose, so some logic (for example `annotationStyles.js`) is duplicated by design
- `playwright`, `@napi-rs/canvas` and `pdfjs-dist` are optional dependencies and must be imported dynamically. pdf.js only runs inside the render worker (`server/image/pdf/`)

## Git workflow

- Commit format: `<type>: <description>`, with type one of feat, fix, refactor, docs, test, chore, perf, ci (`release` is used for releases)
- One commit per logical change, no co-author trailers
- Pull requests target `main`. Changes to the public CLI surface (flags, environment variables, plugin commands) must be reflected in `docs/usage.md`
- Releasing is maintainer-only, see `docs/release.md`
