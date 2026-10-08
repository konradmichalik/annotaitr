# annotaitr for Codex

Codex loads annotaitr as an agent skill. The skill runs the `annotaitr` CLI with `--origin codex` and applies the feedback printed to stdout. It covers images, captured web pages, videos, PDFs and Markdown.

## Install

The skill drives the standalone CLI, so install that first:

```bash
npm install -g annotaitr
```

Then copy the skill to your user skills folder (or `<repo>/.agents/skills` to scope it to one repository):

```bash
mkdir -p ~/.agents/skills
cp -r apps/codex/skills/annotaitr ~/.agents/skills/annotaitr
```

Codex detects new skills automatically. Restart it if the skill does not show up.

## Usage

Invoke the skill by name or just ask for a review:

```text
$annotaitr ./mockup.png
Annotate README.md in the browser
```

The CLI blocks until you submit a decision in the browser. If your Codex shell tool times out earlier, raise its timeout or run the command as a long-running process.
