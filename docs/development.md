# Development

## Getting started

```bash
git clone https://github.com/konradmichalik/annotaitr.git
cd annotaitr
npm install && npm run build
```

## Commands

```bash
npm run dev:client        # Vite dev server with HMR (markdown client)
npm run dev:client:image  # Vite dev server with HMR (image client)
npm run build              # Production build, both clients (single-file HTML each)
npm run dev                # CLI with --watch
npm run test:e2e           # Playwright E2E tests
```

`dev:client`/`dev:client:image` serve the client alone; point them at a
separately-running server with `ANNOTAITR_NO_OPEN=1 node index.js <target>`.

## Claude Code plugin testing

```bash
# Install local plugin
claude plugin install ./apps/claude-code --scope user

# Test plugin without permanent installation
claude --plugin-dir ./apps/claude-code
```

## OpenCode plugin testing

The OpenCode plugin bundles the entire server + client into a single file via tsup. To test locally:

### 1. Build everything

```bash
npm run build

cd apps/opencode
npm install
npm run build
cd ../..
```

This builds both client SPAs (`client/dist/markdown/index.html`, `client/dist/image/index.html`); the OpenCode plugin copies the markdown one (opencode stays markdown-only for now) as `annotator.html` and bundles the server code into `apps/opencode/dist/index.js`.

### 2. Link the CLI globally

```bash
npm link
```

The plugin uses the `annotaitr` CLI as a fallback, so it needs to be available in `PATH` (`md-annotator` also works, as a `bin` alias).

### 3. Configure OpenCode to use the local plugin

Create or edit `opencode.json` in the project root:

```json
{
  "plugin": ["./apps/opencode"]
}
```

### 4. Install the slash command

```bash
cp apps/opencode/commands/*.md ${XDG_CONFIG_HOME:-$HOME/.config}/opencode/command/
```

This registers the `/annotate:md` command for the OpenCode session.

### 5. Run OpenCode

Start OpenCode from the project root. The local plugin provides the `annotate_markdown` tool and the `/annotate:md` slash command.

### Rebuild after changes

After changes to the client, server, or plugin source:

```bash
npm run build && cd apps/opencode && npm run build && cd ../..
```

## Environment variables

See [Usage](usage.md#environment-variables) for the full `ANNOTAITR_*` list (`MD_ANNOTATOR_*` still works as a deprecated fallback).
