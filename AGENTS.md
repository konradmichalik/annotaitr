# AGENTS.md

## Project overview

annotaitr is a plugin and CLI for Claude Code, OpenCode and Mistral Vibe. It opens an image, a captured web page, a video, a PDF or Markdown/plain-text files in a browser UI for annotation. The user's feedback is printed to stdout for the calling agent to apply. Requires Node.js 22.13 or newer.

The mode (`image` or `markdown`) is auto-detected from the CLI target by `detectMode()` in `cli/detect.js`, or forced with `--as`.

Flow: CLI (`index.js`) starts an Express server, opens the browser and blocks until the user submits a decision. Each client is a React SPA built as one single-file HTML bundle (vite-plugin-singlefile).

Stdout is the contract with the calling agent:
- `APPROVED: ...` means no changes needed
- `APPROVED WITH NOTES: ...` means approved as-is, the notes are context and not change requests
- Structured annotation blocks mean the agent applies edits (markdown mode) or matches notes to the annotated screenshot (image mode)

## Structure

- `index.js`: CLI entry, dispatches to a mode runner
- `cli/`: argument parsing (`args.js`), mode detection (`detect.js`), help text, one runner per target kind (`markdown.js`, `image.js`, `video.js`, `document.js`), the stdout output on a decision (`outcome.js`), review session handling (`session.js`) and the `reply` subcommand (`reply.js`)
- `server/core/`: mode-agnostic Express bootstrap, config (`ANNOTAITR_*` environment variables), browser opening, signal handling and review sessions (`session/`: session files and agent replies)
- `server/markdown/`: markdown mode API routes, feedback formatting and file loading
- `server/image/`: image mode, split into `common/` (rendering, feedback basics, element matching, transcription, config) and one folder per target kind: `still/` (image file, URL capture, clipboard), `video/` and `document/` (PDF)
- `client/markdown/`, `client/image/`: the two React SPAs with separate Vite roots. The image client keeps video-only and PDF-only code in `src/video/` and `src/document/`, everything shared across target kinds stays in `components/`, `hooks/` and `utils/`
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
- Both clients render the same chrome (header, workspace toolbar, panel, popovers, modals, done screen) from `client/shared`: design tokens and shared rules live in `client/shared/styles/` (`common.css` imports one file per area), a client's own `styles.css` keeps only rules specific to that mode
- The image server and client share no modules on purpose, so some logic (for example `annotationStyles.js`) is duplicated by design
- `playwright`, `@napi-rs/canvas` and `pdfjs-dist` are optional dependencies and must be imported dynamically. pdf.js only runs inside the render worker (`server/image/document/pdf/`)

## Git workflow

- Commit format: `<type>: <description>`, with type one of feat, fix, refactor, docs, test, chore, perf, ci (`release` is used for releases)
- One commit per logical change, no co-author trailers
- Pull requests target `main`. Changes to the public CLI surface (flags, environment variables, plugin commands) must be reflected in `docs/usage.md`
- Releasing is maintainer-only, see `docs/release.md`
