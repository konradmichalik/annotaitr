# Markdown and plain text

One or more Markdown, plain-text, config or data files open in a single review. The selection bar, the Files sidebar and the intents are described in [Tools and the feedback panel](interface.md). Shared flags and the output format are in the [CLI reference](../usage.md).

```bash
annotaitr README.md
annotaitr README.md docs/guide.md config.yaml
```

![A Markdown review with a Files overview and numbered notes](../../site/images/05-markdown.png)

## Supported files

Markdown (`.md`, `.markdown`, `.mdown`, `.mkd`) renders as formatted text. Config and data files render as raw source with line numbers: `.yaml`, `.yml`, `.json`, `.jsonc`, `.json5`, `.toml`, `.ini`, `.cfg`, `.conf`, `.properties`, `.csv`, `.tsv`, `.log`, `.xml`, `.txt`, `.text` and `.env.example`.

Files above 2 MB are rejected. A real `.env` file is not supported, because it commonly holds secrets.

## `--feedback-notes`

Markdown mode only. Attaches read-only AI notes to the first file, so a
re-opened review round shows what changed since the last submission instead
of a blank slate. A JSON array of `{text, line?}` objects, inline or as a
file path; `line` is the line number in the file being opened, omitted for a
general note.

```bash
annotaitr --feedback-notes '[{"text":"Rewrote intro","line":5}]' README.md
annotaitr --feedback-notes notes.json README.md
```

<details>
<summary>Same option via the ANNOTAITR_FEEDBACK_NOTES environment variable</summary>

```bash
ANNOTAITR_FEEDBACK_NOTES='[{"text":"Rewrote intro","line":5}]' annotaitr README.md
```

</details>
