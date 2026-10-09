# Design rules

These rules are binding for every change to the annotaitr UI: both clients, the done page and the settings. When a change needs to break one, change the rule here first, in the same pull request, and say why.

The screens these rules produce are listed in [screens.md](screens.md). The tokens live in `client/shared/styles/tokens.css`. `client/shared/styles/base.css` still maps the older variable names (`--bg`, `--text`, `--primary` and so on) onto them until each screen uses the tokens directly.

## Principles

1. **Ink for the tool, colour for the feedback.** The chrome is ink and greys. Every colour on screen is an annotation or a status.
2. **Intent before looks.** A note says what the agent should do (Change, Add, Remove, Question). Colour, icon and word carry the same intent.
3. **One number, two places.** A mark on the canvas and its card in the panel share number, colour and focus.
4. **One exit, clearly named.** One split button whose default follows the state. Before anything is sent, the reviewer sees what goes out.
5. **Keyboard first.** Every tool has a letter, every drag has a click alternative, every focus stays visible.

## Colour

All colours come from tokens in `client/shared/styles/tokens.css`, with a light and a dark value. No literal colours in components.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--canvas` | `#eef0f3` | `#0f1114` | Work area behind the target, with a 20px dot grid |
| `--surface` | `#fbfbfc` | `#121418` | Header, panel, status bar |
| `--surface-sunken` | `#f6f7f9` | `#121418` | Page strip, table of contents, settings navigation |
| `--card` | `#ffffff` | `#16191e` | Cards, popovers, dock |
| `--ink` | `#16181d` | `#eceef2` | Text, primary button, selected tool |
| `--ink-muted` | `#5a6170` | `#a3a9b5` | Secondary text, meta, status bar |
| `--line` | `#e2e5ea` | `#22262d` | Separators and card outlines only |
| `--line-control` | `#8a909c` | `#6b7280` | Boundaries of inputs, selects and toggles |
| `--focus` | `#2f55c8` | `#8fb0ff` | Focus ring, selected card, link |

- **The primary button is ink.** Light theme: ink fill, white text. Dark theme: light fill, ink text. No green or orange decision buttons.
- **`--line` is decoration, `--line-control` is a boundary.** A field outlined with `--line` fails WCAG 1.4.11.
- **Status colours differ from ink in lightness, not only in hue.**

### Intents

| Intent | Icon | Mark | Number on mark | Label light | Label dark |
| --- | --- | --- | --- | --- | --- |
| Change | Pen | `#c04a00` | white | `#9a3b00` | `#ffb07a` |
| Add | Plus | `#e69f00` | ink | `#7a5400` | `#f0c05a` |
| Remove | Minus | `#a8457e` | white | `#8a3466` | `#f0abd0` |
| Question | Question mark | `#0072b2` | white | `#005a8c` | `#8fd0f5` |
| Earlier round | none | dashed `#5a6170` outline, never filled | ink | `--ink-muted` | `--ink-muted` |

- The palette is derived from Okabe-Ito and stays distinct under protanopia and deuteranopia. White numbers hold at least 4.98:1 on the mark colours.
- **Marks follow the image, not the theme.** The marks on the canvas use the same colours in light and dark theme, because the image under them does not change. Only labels in the chrome switch to the dark values.
- A mark gets a soft 1px light halo (`rgba(255,255,255,0.6)`) that only shows where the image under it is dark. No hard dark outline.
- The ink colour of a shape is a separate, optional style for visibility on busy images. It never replaces the intent: the number badge keeps the intent colour. New marks have no ink unless one is fixed in the dock (`Intent colour` is the default).

### Changes and code

Changes and code modes add tokens for diff lines and syntax. They switch with the theme, unlike the marks, because the code is rendered by the chrome. The dark values are proposals: no dark board for these modes exists yet, so they are checked against 4.5:1 when the tokens land.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--diff-add` | `#eaf6ee` | `#12261a` | Added line |
| `--diff-add-gutter` | `#d7eedf` | `#183420` | Line numbers of an added line |
| `--diff-add-word` | `#bfe5cb` | `#1f4a2b` | Changed words inside an added line |
| `--diff-add-text` | `#1a6a35` | `#7fd39a` | `+` sign, added line numbers, `+8` counts |
| `--diff-del` | `#fcecec` | `#2a1416` | Removed line |
| `--diff-del-gutter` | `#f6d6d6` | `#3a1a1d` | Line numbers of a removed line |
| `--diff-del-word` | `#f0bcbc` | `#5a2328` | Changed words inside a removed line |
| `--diff-del-text` | `#a32626` | `#ff9a9a` | `−` sign, removed line numbers, `−2` counts |
| `--syntax-keyword` | `#6a3fb5` | `#c4a5ff` | Keywords |
| `--syntax-type` | `#00727a` | `#6fd6dc` | Class and type names |
| `--syntax-string` | `#2f6b1f` | `#9fd88a` | Strings |
| `--syntax-comment` | `#6b7280` | `#8b93a1` | Comments, in italics |

- Added and removed differ by the sign column and by which line number column is filled, never by colour alone. Line references in cards carry the side: `+L43` for the new file, `−L43` for the old one.
- A line with a note gets a wash of its intent colour (7 to 10% alpha) behind the code, and the mark sits in the gutter. Diff colours stay below the wash, so the intent stays readable on added and removed lines.
- Syntax colours stay muted. They never reuse an intent colour.

## Typography

| Role | Font | Size and weight |
| --- | --- | --- |
| Done page title | Geist | 20px, 600 |
| Dialog and section titles | Geist | 15px, 600 |
| Body, cards, buttons | Geist | 13px, 400 or 500 |
| Meta, labels, status bar | Geist | 12px |
| Paths, selectors, timecodes, keys | Geist Mono | 11 to 12.5px |

- **12px is the minimum** for text. Key caps may use 11px Geist Mono.
- Numbers that change or line up (counts, timecodes, page numbers, zoom) use tabular digits.
- No uppercase badges. An intent is a word with an icon, in sentence case.
- The target keeps its own fonts. The markdown preview may use a reading face, the chrome never does.
- Geist and Geist Mono ship inside the single-file bundle (OFL). No font CDN: no request leaves localhost.

## Spacing, radii, elevation

| Element | Value |
| --- | --- |
| Spacing scale | 4, 8, 12, 16, 24, 32px |
| Radius | 6px controls, 10px cards, 12px popovers (composer, thread), 14px dock and dialogs; `--radius-full` for pills and round badges, `--radius-sm` (4px) only for marks inside text such as inline code and search hits |
| Elevation e1 | Panels: `0 1px 2px rgb(22 24 29 / 6%)` |
| Elevation e2 | Dock, popovers: `0 2px 4px rgb(22 24 29 / 6%), 0 12px 32px rgb(22 24 29 / 12%)` |

Radii and spacing in the CSS come from these tokens (`--radius-*`, `--space-*`). Values off the scale (a 6px gap, a 0.375rem padding) remain where moving them would shift the layout; new rules use the scale.

## Layout

| Element | Value |
| --- | --- |
| Header height | 52px |
| Status bar height | 30px |
| Feedback panel width | 340px |
| Page strip width | 96px (thumbnails 60px) |
| Table of contents width | 220px |
| Files sidebar (changes, code, diff) | 260px |
| Code gutter | 30px mark column, 40px line numbers; 20px line height |
| Dock tool | 40px square |
| Header icon button | 32px square |
| Pin on the canvas | 24px, 32px hit area |
| Mark in the code gutter | 20px, the gutter `+` button 24px |

### Header

Left to right, the same in every mode:

1. Logo and wordmark.
2. Source chip with icon: `PDF`, `Image`, `Clipboard`, `URL`, `Video`, `Markdown`, `Changes`, `Code`, and `Text` for a plain-text file in markdown mode.
3. Target in Geist Mono (a path, or `branch → base` for changes), then one line of facts (pages, size, duration, file position, file count) and the round chip when there is an earlier round. The round chip is neutral in every mode: outline, `--focus` dot, `Round n`. Never filled with ink, which belongs to the primary button.
4. Shortcuts, settings and panel toggle as icon buttons.
5. The origin indicator, then the decision split button.

### Origin indicator

The header always says who is waiting for the decision. It comes from `--origin`.

| Origin | Text |
| --- | --- |
| `claude-code` | Claude Code is waiting |
| `opencode` | OpenCode is waiting |
| `vibe` | Mistral Vibe is waiting |
| `gemini` | Gemini CLI is waiting |
| `cli` | Terminal is waiting |

A status dot plus the words, never the dot alone. The tooltip names the caller (`Started from Claude Code`) and says the decision is printed back to that session. It does not name the slash command: the client never receives it, and the caller is what the reviewer needs to know.

### Canvas

- **Dock:** tools float at the bottom centre of the work area. Groups are separated by a hairline: select tools, drawing tools, pin, then ink colour and undo. A mode shows only the tools that work in it.
- **Floating controls:** zoom at the top right in every mode except changes and code, which reflow instead of zooming. PDF adds page navigation, web capture adds the capture control at the top left. View options such as the diff layout sit above the content, never in the dock.
- **Status bar:** left, what the active tool does and its keys. Right, the facts about the target.

### Feedback panel

- Title `Feedback`, then a two-way switch: `This round · n` and `Replies · n` (image, PDF, web, video, changes) or `This file · n` and `All files · n` (Markdown, code). The switch only shows when its second side can hold something: an earlier round, or more than one file. An empty `Replies · 0` tab would only be a dead end.
- One card per note: number on the intent colour, intent icon and word, location (page, selector, timecode or line), then the quote and the comment.
- Card actions are visible on hover and on `:focus-within`, never on hover only.
- The general comment is a collapsed row `+ General comment` (key `G`) at the bottom. It opens into a field on click. Once written, the row reads `Edit general comment` and does not repeat the text.
- A written general comment is also a card at the top of the list: no number, the neutral word `General` with a comment icon, the full text wrapped, and the same hover and `:focus-within` actions. Edit opens the row's field, delete removes the comment. Its accessible name is `General comment`. It counts as content for the empty state and as one entry in the `This round`, `This file` and `All files` counts, like the header count. While its editor is open the card keeps the saved text until the draft is saved. In Markdown it belongs to the active file; a draft is dropped when the file changes.
- Empty panel: one sentence on what a note becomes, the three main tool keys, and that the main button reads Approve until the first note exists.

## Modes

| Mode | Tools | Floating controls | Card location |
| --- | --- | --- | --- |
| PDF | Select, Element, Text, Box, Arrow, Freehand, Highlighter, Pin | Page navigation, zoom | Page and shape |
| Image, clipboard | Select, Box, Arrow, Freehand, Highlighter, Pin | Zoom | Shape and coarse position |
| Web capture | Select, Element, Box, Arrow, Freehand, Highlighter, Pin | Capture control, zoom | Selector and element text |
| Video, GIF | Select, Box, Arrow, Freehand, Pin | Zoom | Timecode or span |
| Markdown | Select text, Pinpoint, Preview and Source switch | none | Section and line |
| Changes | Select text, Lines | none | File and line on the new or old side (`+L43`, `−L43`), or `Overview` |
| Code (deferred) | Select text, Lines | none | Line or line range (`L35–37`, `after L55`) |
| Diff, later rounds (deferred) | Select text, Lines | Compare switch above the files | Line on the new or old side (`+L43`, `−L43`) |

- **PDF:** the page strip shows a count badge on pages with notes and a dashed dot on pages with replies from an earlier round.
- **Web capture:** the capture control is collapsed to `Desktop · 1440 ▾` plus an icon button `Capture again`. Viewport and delay live in its popover. The Element tool labels the hovered element with its selector and size. `Tab` walks the element tree, `↑` selects the parent. The DOM map has no parent links, so the tree is the map in document order and the parent is the smallest element whose box holds the current one. The walk runs while the canvas has keyboard focus; past the last element `Tab` leaves it. The panel's submit reads `Capture`, so it is not confused with the `Capture again` icon button.
- **Video:** the timeline sits under the work area with two lanes. `Notes` holds point notes, `Spans` holds ranges. Notes closer than a marker width merge into a cluster chip that shows both colours and the count, and opens a list on click or `Enter`. The list opens above the lanes and never covers the transport controls. Overlapping spans each get their own row. A playhead line runs across both lanes. Marks from the earlier round sit on the same lanes, dashed and grey, and join a cluster like any note, listed with their round and status. Notes inside a cluster are reached through its list, which seeks to the note; they are dragged once they stand apart again. Spans are set with `I` and `O`, never only by dragging.
- **Markdown:** the left sidebar starts with `Files`: every file with its note count, a reviewed check or `not opened`, and `n of m reviewed`. Below it the contents of the active file with note counts per section, and `Mark file as reviewed` at the bottom. Selecting text opens a dark bar with Change, Add, Remove and Ask, keys `1` to `4`, then Label (`⌥1` to `0`) and Open, each with its key as a hint. `⌘K` (Change) and `⌘D` (Remove) still work. Add inserts text after the selection and is offered on text selections only; `⌥`-click inserts at any position. Any other key starts a Change comment with that key. The bar is ink, so it turns light in the dark theme like the primary button, and its focus ring uses the bar's text colour, because `--focus` does not reach 3:1 on ink.
- **Changes, code and diff share one rule: keep them as simple as Markdown.** No folder notes, no per-file checkboxes, no whitespace toggle, no split view, no search in the header. Anything beyond lines, text and a code suggestion needs a rule here first.
- **Changes:** the agent presents its changes before a commit or pull request, and the reviewer annotates them. It looks like the files view of a pull request, with the agent's explanations added.
  - **What is compared:** by default the branch against its merge base with the default branch, working tree and untracked files included. That covers the review before a commit and the review before a pull request. The facts line in the header names it (`4 files · +26 −7 · working tree included`), the status bar names the base commit.
  - **The diff comes from git, never from the agent.** The agent only supplies text: a title and summary, the proposed commit message, one line per file and optionally one line per hunk. Agent text sits on `--surface-sunken` with the agent icon and starts with `Explained by <origin>` in the overview, so it never reads as code.
  - **Sidebar:** `Changed files` as a folder tree, single-child folders joined (`Domain/Repository`). Each file shows its status letter (`A`, `M`, `D`, `R`, named in its accessible label), its note count or a reviewed check. `Overview` sits on top with the overview's note count. A filter field, `n of m reviewed` and `Mark file as reviewed` as in Markdown. `J` and `K` move to the next and previous file.
  - **Overview:** the first card in the work area. Title, summary, then `After approval` with the proposed commit message in Geist Mono, and how many files are explained. The summary and the commit message take notes like any text.
  - **Files:** one card per file in tree order, with path, `+n −n` and `Open full file`, then the agent's line for the file, then the hunks. A hunk line from the agent sits above its hunk. A reviewed file collapses to its header and the agent's line.
  - **Not explained:** a file the agent did not mention gets a dashed marker in the tree (named `not explained` for screen readers), a dashed `Not explained` pill and a dashed outline on its card, stays expanded, and says `<origin> did not mention this change`. The overview links to them. This is what keeps the presentation honest: every change shows up, explained or not.
  - **Rounds:** round 1 has no panel switch. A later round shows `This round` and `Replies` and follows the diff rules below.
- **Code (deferred):** the left sidebar is `Files` as in Markdown, shown as a folder tree with a filter field. A file shows its note count, a reviewed check or `not opened`; a folder shows its file count. `n of m reviewed` sits at the top, `Mark file as reviewed` at the bottom. The file view shows one file with folded regions (`Lines 1 to 27 folded`) that open on click. `Lines` (`L`) comments on lines: click a line number, `Shift`+click or drag over the numbers to extend; hovering a line shows a `+` button in the gutter. `Select text` (`V`) comments on a selection inside a line, which is underlined in the intent colour. Remove strikes the lines through, Add shows a `+` marker after the line.
- **Diff, later rounds (deferred):** this becomes round 2 and later of Changes. One unified diff of all changed files, each file collapsible with its path, `+n −n` and `Open full file`, which opens it in code mode. Hunks show their header and open hidden context on click. Above the files, one switch: `Since round n` and `Whole branch`, each with its file count. The sidebar lists the changed files in the agent's order with its one-line summary per file, and names the files unchanged since the last round. The agent may add one line per hunk explaining it (`Claude Code: …, for your note 3`). A note from the earlier round sits in the gutter of the line it was on, grey and dashed, and its thread opens below that line.

## Notes

- Numbers are stable for the whole round. Deleting a note never renumbers the others, or the agent's references break. The output lists notes by position, so their numbers need not ascend. The next round starts at 1.
- The general comment has no number and no intent.
- Selecting a mark selects its card and scrolls it into view, and the other way round.
- Marks from an earlier round are grey and dashed so they never compete with new notes.

### Composer

- **Text first.** The popover opens with the text field focused, placeholder `Add a comment…`. Nothing sits above it.
- One footer row: the intent chip (`✎ Change ▾`), a palette icon for ink and stroke, `Cancel` as text and `Add ⌘↵` as the only filled button. In changes and code the palette icon is replaced by `Suggest code`, which opens a suggestion block below the field: the selected lines as `−`, the reviewer's version as `+`. The block can be removed again and never sits above the field.
- In changes and code the composer opens inline, below the last selected line, so the code above stays visible.
- Default intent: Change for shapes and text selections, Question for pins. Keys `1` to `4` switch it without opening the menu while focus is in the composer but outside its text field (on the chip after `Tab`, for example), so digits typed into a comment stay text. A markdown insertion has no chip, it is always Add. The default is configurable in Settings.
- The focused popover border is the focus indicator: 1.5px `--focus` plus a soft ring while focus is inside. The field itself has no outline. Buttons inside keep the 2px ring.
- A voice note, where available, is its own microphone button next to the palette, not behind it: closing the palette must not stop a recording.
- A draft survives a click outside in every mode. A draft is typed text that differs from what the composer opened with, or a changed ink or stroke. An untouched composer closes on a click outside, and a mark drawn just before goes with it. `Esc` and `Cancel` discard.
- Both clients use the shared shell in `client/shared/components/Composer.jsx`. The markdown composer keeps `@` file suggestions and an expand button in the footer. It has no drag handle, because nothing may sit above the field.
- The popover is `role="dialog"`. The field gets its accessible name from a visually hidden heading (`Note 3, box`). This is the only place a field goes without a visible label.

### Threads

- A thread from an earlier round shows the reviewer's note, the agent's reply and the reviewer's pending reply in order.
- Agent status is a chip with icon and word: Applied, Partial, Declined, Deferred, Question, No reply. Never colour alone.
- A pending reply is dashed and says `Pending, sent with your decision`.
- In changes a thread opens inline below its line, headed `Round n · note m` with intent and status chip, and offers `Reply` and `Mark resolved`. There is no separate resolved list: the thread stays under `Replies`.

## Decision

- The split button's main action follows the state: `Approve` with no notes, `Send feedback n` with notes. The chevron opens the decision dialog. While the agent waits for answers to its questions, the main action opens the dialog first, with that option selected and the open questions listed.
- The dialog offers three options with one sentence each: Send feedback, Approve with notes, Approve. It shows the note count by intent, an optional summary for the agent and how many pending replies go out.
- Choosing Approve while notes exist asks once before discarding them.
- In Changes the decision gates the agent's next step: Approve lets it commit or open the pull request with the proposed message, Approve with notes does the same and passes the notes on as context, Send feedback asks it to revise and present again. The dialog says this in its one sentence per option.
- `⌘⇧↵` opens the decision from anywhere. `⌘↵` only saves a note or submits the open dialog, so a composer can never send the review by accident.

## Done page

| Outcome | Shows | Closes |
| --- | --- | --- |
| Send feedback | `Sent to <origin>`, counts, the first notes and `+ n more` | after the configured delay, with `Keep open` |
| Approve | Check, `Approved`, the target name | after the configured delay, with `Keep open` |
| Approve with notes | The notes in a dashed box, labelled as context | after the configured delay, with `Keep open` |
| Session gone | `<origin> stopped waiting`, notes not delivered, Copy as Markdown, Save annotated image, Export JSON | never on its own |

The countdown is one line with a progress bar. No duplicated close hints.

Session gone builds its exports in the browser, since the server has stopped: the Markdown is a short list of the notes rather than the agent's output, and the image is drawn from the picture last shown with its marks.

## Settings

- Sections in a left column: General, Markdown, Shortcuts, About. Changes apply immediately. The footer only holds `Reset to defaults`.
- General: Theme (Light, Dark, System as preview tiles), Close tab after a decision (Never, Now, 3 s, 5 s), Keep drafts (markdown only, the image modes keep no drafts), Tool hints, Default intent.
- Markdown: content width, font size, starting mode.
- Shortcuts: a searchable list grouped by Tools, Notes, Pages or Timeline, Review; markdown, changes and code add Search, still images and web pages have View for zoom. It lists only the keys of the open mode and opens directly with `?`.

## Shortcuts

| Key | Action |
| --- | --- |
| `V` `E` `T` `R` `A` `P` `H` `C` | Select, Element, Text, Box, Arrow, Freehand, Highlighter, Pin |
| `V` `L` | Select text, Lines (changes and code; `V` is Select text as in Markdown) |
| `J` `K` | Next and previous file (changes) |
| `1` to `4` | Intent in the composer (outside its text field), of the markdown selection or of the note selected on the canvas |
| `G` | General comment |
| `⌘↵` | Save note, submit the open dialog |
| `⌘⇧↵` | Open the decision |
| `⌫` | Delete the selected note |
| `⌘Z`, `⌘⇧Z` | Undo, redo |
| `[` `]`, `Home` `End` | Previous and next page, first and last page |
| `Space`, `←` `→`, `I` `O` | Play, one frame, span in and out |
| `?` | Shortcut list |
| `Esc` | Close the popover, back to Select |

Tool tooltips show the name and the key cap.

## Accessibility

WCAG 2.2 AA, built into the components rather than checked afterwards.

| Criterion | Rule |
| --- | --- |
| 1.4.3 Text contrast | 4.5:1 for all chrome text, chips and pin numbers, light and dark |
| 1.4.11 Non-text contrast | 3:1 for control boundaries, selected tool, focus ring and marks |
| 2.1.1 Keyboard | Every action reachable without a pointer. The panel list is the accessible twin of the canvas |
| 2.4.7 and 2.4.11 Focus | 2px `--focus` ring with offset everywhere, also in popovers. A focused mark scrolls clear of dock and header |
| 2.5.7 Dragging | Box and arrow by two clicks, nudging with arrow keys, spans with `I` and `O`, splitters as focusable separators |
| 2.5.8 Target size | Nothing interactive below 24px |
| 4.1.2 Name, role | Popovers are dialogs with a name, icon-only buttons have an `aria-label`, tabs and switches use their roles |
| 4.1.3 Status messages | `aria-live` on add, delete, page change and submit. Both status bars carry `role="status"` |

## Motion

Motion is added only inside `prefers-reduced-motion: no-preference`. Start from no motion and opt in.

| Where | What | Duration |
| --- | --- | --- |
| Popover, dialog | Fade and 4px rise | 120 ms |
| Selected card and mark | Focus ring fades in | 150 ms |
| Done page countdown | Progress bar shrinks | the configured delay |

Nothing else moves.

## Copy

- The UI is English. Sentence case for labels and buttons.
- Fixed names: Change, Add, Remove, Question; Send feedback, Approve, Approve with notes; General comment; This round, Replies; Mark file as reviewed; Suggest code; Overview, Changed files, Not explained, After approval.
- The origin is named in full: Claude Code, OpenCode, Mistral Vibe.

## Output contract

The intent is a field of every annotation and part of the stdout output. Adding or renaming an intent changes the contract with the calling agent, so it goes with tests and an update to [usage.md](../usage.md).

Changes round 1 is built on the markdown client (`annotaitr changes` writes the walkthrough, the client lays it out); code and later rounds are deferred. Changes adds to the contract in both directions:

- **In:** the agent's explanation, read from a file it writes: title, summary, proposed commit message, one line per file and per hunk. annotaitr reads the diff from git itself and matches the explanation to it by path and line range; text for a path without changes is shown as a warning, not dropped.
- **Out:** each note names its file, the side (`old` or `new`) and the line or line range, keeping the heading grammar (`## 1. Change · Text (new Lines 43-49 in src/Foo.php) [#a3f19c2e]`), followed by the quoted lines and the comment. A code suggestion follows as `Replaces:` and `Suggested code:` blocks. Notes on the overview name `Overview` or `Commit message`. The output starts with one line naming what was compared, and the decision says whether the agent may commit.

All of it goes with tests and an update to [usage.md](../usage.md) in the same pull request as the mode.

## Landing page

- `site/` is plain HTML, one CSS file and one small script, no build step and no framework. `.github/workflows/pages.yml` deploys it together with `scripts/install.sh`.
- Colours, fonts and spacing are CSS custom properties on `:root`, taken from the token table above. Intent colours come as a pair: the mark colour and its darker label colour for text.
- Geist and Geist Mono are self-hosted from `site/fonts/` with their licence. No CDN, analytics, embeds or any other third-party request. URLs are relative, because the site is served under `/annotaitr/`.
- Animation follows the Motion rules: it sits inside `prefers-reduced-motion: no-preference`, the static state is the final state, and scroll reveal runs only inside `@supports (animation-timeline: view())` and never hides content otherwise.
- No horizontal scrolling down to 320px. Code wraps instead of scrolling.
- The page works without JavaScript. The script only enhances, for example the screenshot lightbox on a native `<dialog>`.
- Copy claims only what README and docs state. Say "no tracking and no account", never "nothing is sent": the CLI checks for updates.
- The screenshots in `site/images/` are exports of the reference screens. When a screen changes, export it again and replace the file.

## Pull request checklist

- [ ] Colours come from tokens, no literals
- [ ] Text at 12px or more, Geist Mono only for paths, selectors, timecodes and keys
- [ ] Every note carries an intent with icon and word
- [ ] Mark and card share number, colour and focus
- [ ] Every drag has a click or key alternative
- [ ] Light, dark and reduced motion checked, screenshot in the PR
- [ ] A rule that changed is updated in this file
