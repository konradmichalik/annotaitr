#!/bin/bash
set -e

REPO="konradmichalik/annotaitr"
PACKAGE_NAME="annotaitr-opencode"

echo "annotaitr — OpenCode Plugin Installer"
echo ""

# Install OpenCode slash command
OPENCODE_COMMANDS_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/command"
mkdir -p "$OPENCODE_COMMANDS_DIR"

cat > "$OPENCODE_COMMANDS_DIR/annotate:md.md" << 'COMMAND_EOF'
---
description: Annotate a markdown file in the browser
---

Use the `annotate_markdown` tool to open the specified file for interactive review.

**Arguments:** $ARGUMENTS

If arguments contain file path(s), use those files.
Otherwise, ask the user which markdown file they want to annotate.

The user can:
- Select text and ask for a change, an addition, a removal or ask a question about it
- Insert text at specific locations
- Approve the file with no changes

After the user submits their decision:
- If approved: No action needed
- If feedback provided: Apply the requested changes to the file. Each numbered note states its intent
  after the number (`## 3. Question · Text (Line 7)`): Change applies the comment, Add inserts the text
  after its `After:` context or adds what the comment asks, Remove deletes the quoted text, Question asks
  without requesting an edit, so answer it. Numbers stay fixed for the round, so they can have gaps.

## Re-review loop

Unless the user specified `--no-review`, after applying changes:

1. Create feedback notes describing what you changed:
   - Use `feedbackNotes` parameter with `[{text, line?}]` entries
   - Include `line` for location-specific notes (use line numbers from the **updated** file)
   - Omit `line` for general notes

2. Re-open the annotator with notes:
   ```
   annotate_markdown({ filePath: "...", feedbackNotes: [{text: "Changed X", line: 5}] })
   ```

3. If approved → done. If more feedback → apply and repeat.
COMMAND_EOF

echo "Installed /annotate:md command to ${OPENCODE_COMMANDS_DIR}/annotate:md.md"

# Clear cached OpenCode plugin to force fresh download on next run. Both the
# pre-rename (md-annotator-opencode) and current (annotaitr-opencode) package
# names are cleared, so an existing install upgrades cleanly.
rm -rf "$HOME/.cache/opencode/node_modules/@md-annotator" "$HOME/.cache/opencode/node_modules/md-annotator-opencode" 2>/dev/null || true
rm -rf "$HOME/.cache/opencode/node_modules/@annotaitr" "$HOME/.cache/opencode/node_modules/annotaitr-opencode" 2>/dev/null || true
rm -rf "$HOME/.bun/install/cache/@md-annotator" "$HOME/.bun/install/cache/md-annotator-opencode" 2>/dev/null || true
rm -rf "$HOME/.bun/install/cache/@annotaitr" "$HOME/.bun/install/cache/annotaitr-opencode" 2>/dev/null || true
echo "Cleared OpenCode plugin cache"

echo ""
echo "=========================================="
echo "  OPENCODE SETUP"
echo "=========================================="
echo ""
echo "Add the plugin to your opencode.json:"
echo ""
echo "  \"plugin\": [\"${PACKAGE_NAME}@latest\"]"
echo ""
echo "(Remove any previous \"md-annotator-opencode\" entry — it's superseded"
echo "by ${PACKAGE_NAME}.)"
echo ""
echo "Then restart OpenCode. The /annotate:md command is ready!"
echo ""
echo "=========================================="
echo "  CLAUDE CODE SETUP"
echo "=========================================="
echo ""

npm uninstall -g md-annotator 2>/dev/null || true
npm install -g annotaitr@latest
echo "Installed annotaitr CLI globally (md-annotator still works as an alias)"

# The playwright package installs without a browser build. Only web page
# capture needs one, so point at it instead of downloading ~150 MB unasked.
# The version is pinned because each playwright release expects its own
# Chromium revision, and an unpinned npx would fetch the latest one.
PLAYWRIGHT_DIR="$(npm root -g)/annotaitr"
PLAYWRIGHT_VERSION="$(cd "$PLAYWRIGHT_DIR" 2>/dev/null && node -p "require('playwright/package.json').version" 2>/dev/null || true)"
CHROMIUM_PATH="$(cd "$PLAYWRIGHT_DIR" 2>/dev/null && node -p "require('playwright').chromium.executablePath()" 2>/dev/null || true)"
if [ -n "$CHROMIUM_PATH" ] && [ -x "$CHROMIUM_PATH" ]; then
  echo "Found Chromium for web page capture"
else
  echo "Web page capture needs a Chromium build. Install it with:"
  echo "  npx playwright${PLAYWRIGHT_VERSION:+@$PLAYWRIGHT_VERSION} install chromium"
fi

if command -v claude &> /dev/null; then
  # The marketplace was renamed from md-annotator to annotaitr. Drop the old
  # registration first so `claude plugin marketplace add` below doesn't just
  # find it already present under the old name and skip re-adding.
  claude plugin marketplace remove md-annotator 2>/dev/null || true

  if claude plugin marketplace update annotaitr 2>/dev/null; then
    echo "Updated annotaitr marketplace"
  else
    if claude plugin marketplace add "$REPO"; then
      echo "Added annotaitr marketplace"
    else
      echo "Failed to add annotaitr marketplace" >&2
      exit 1
    fi
  fi

  # Both the plugin and the marketplace it's published under were renamed
  # (annotate -> annotaitr), so an install under the old md-annotator
  # marketplace needs replacing rather than updating in place.
  claude plugin uninstall annotate@md-annotator 2>/dev/null || true

  if claude plugin update annotaitr@annotaitr 2>/dev/null; then
    echo "Updated Claude Code plugin"
  else
    if claude plugin install annotaitr@annotaitr; then
      echo "Installed Claude Code plugin"
    else
      echo "Failed to install Claude Code plugin" >&2
      exit 1
    fi
  fi
else
  echo "Claude Code CLI not found. Install it first, then run:"
  echo "  claude plugin marketplace add $REPO"
  echo "  claude plugin install annotaitr@annotaitr"
fi
