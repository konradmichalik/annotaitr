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
| `--brand` | `#767f9e` | `#767f9e` | The logo, nothing else |

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
- The ink colour of a shape is a separate, optional style for visibility on busy images. It never replaces the intent.

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
| Radius | 6px controls, 10px cards, 14px dock and dialogs |
| Elevation e1 | Panels: `0 1px 2px rgb(22 24 29 / 6%)` |
| Elevation e2 | Dock, popovers: `0 2px 4px rgb(22 24 29 / 6%), 0 12px 32px rgb(22 24 29 / 12%)` |

These replace the mixed px and rem values and the roughly 30 hardcoded radii in the current CSS.

## Layout

| Element | Value |
| --- | --- |
| Header height | 52px |
| Status bar height | 30px |
| Feedback panel width | 340px |
| Page strip width | 96px (thumbnails 60px) |
| Table of contents width | 220px |
| Dock tool | 40px square |
| Header icon button | 32px square |
| Pin on the canvas | 24px, 32px hit area |

### Header

Left to right, the same in every mode:

1. Logo and wordmark.
2. Source chip with icon: `PDF`, `Image`, `Clipboard`, `URL`, `Video`, `Markdown`, and `Text` for a plain-text file in markdown mode.
3. Target in Geist Mono, then one line of facts (pages, size, duration, file position) and the round chip when there is an earlier round.
4. Shortcuts, settings and panel toggle as icon buttons.
5. The origin indicator, then the decision split button.

### Origin indicator

The header always says who is waiting for the decision. It comes from `--origin`.

| Origin | Text |
| --- | --- |
| `claude-code` | Claude Code is waiting |
| `opencode` | OpenCode is waiting |
| `vibe` | Mistral Vibe is waiting |
| `cli` | Terminal is waiting |

A status dot plus the words, never the dot alone. The tooltip names the command that started the review and says the decision is printed back to that session.

### Canvas

- **Dock:** tools float at the bottom centre of the work area. Groups are separated by a hairline: select tools, drawing tools, pin, then ink colour and undo. A mode shows only the tools that work in it.
- **Floating controls:** zoom at the top right in every mode. PDF adds page navigation, web capture adds the capture control at the top left.
- **Status bar:** left, what the active tool does and its keys. Right, the facts about the target.

### Feedback panel

- Title `Feedback`, then a two-way switch: `This round · n` and `Replies · n` (image, PDF, web, video) or `This file · n` and `All files · n` (Markdown). The switch only shows when its second side can hold something: an earlier round, or more than one file. An empty `Replies · 0` tab would only be a dead end.
- One card per note: number on the intent colour, intent icon and word, location (page, selector, timecode or line), then the quote and the comment.
- Card actions are visible on hover and on `:focus-within`, never on hover only.
- The general comment is a collapsed row `+ General comment` (key `G`) at the bottom. It opens into a field on click and shows the start of the text once written.
- Empty panel: one sentence on what a note becomes, the three main tool keys, and that the main button reads Approve until the first note exists.

## Modes

| Mode | Tools | Floating controls | Card location |
| --- | --- | --- | --- |
| PDF | Select, Element, Text, Box, Arrow, Freehand, Highlighter, Pin | Page navigation, zoom | Page and shape |
| Image, clipboard | Select, Box, Arrow, Freehand, Highlighter, Pin | Zoom | Shape and coarse position |
| Web capture | Select, Element, Box, Arrow, Freehand, Highlighter, Pin | Capture control, zoom | Selector and element text |
| Video, GIF | Select, Box, Arrow, Freehand, Pin | Zoom | Timecode or span |
| Markdown | Select text, Pinpoint, Preview and Source switch | none | Section and line |

- **PDF:** the page strip shows a count badge on pages with notes and a dashed dot on pages with replies from an earlier round.
- **Web capture:** the capture control is collapsed to `Desktop · 1440 ▾` plus an icon button `Capture again`. Viewport and delay live in its popover. The Element tool labels the hovered element with its selector and size. `Tab` walks the element tree, `↑` selects the parent.
- **Video:** the timeline sits under the work area with two lanes. `Notes` holds point notes, `Spans` holds ranges. Notes closer than a marker width merge into a cluster chip that shows both colours and the count, and opens a list on click or `Enter`. The list opens above the lanes and never covers the transport controls. Overlapping spans each get their own row. A playhead line runs across both lanes. Spans are set with `I` and `O`, never only by dragging.
- **Markdown:** the left sidebar starts with `Files`: every file with its note count, a reviewed check or `not opened`, and `n of m reviewed`. Below it the contents of the active file with note counts per section, and `Mark file as reviewed` at the bottom. Selecting text opens a dark bar with Change, Add, Remove and Ask, keys `1` to `4`.

## Notes

- Numbers are stable for the whole review. Deleting a note never renumbers the others, or the agent's references break.
- Selecting a mark selects its card and scrolls it into view, and the other way round.
- Marks from an earlier round are grey and dashed so they never compete with new notes.

### Composer

- **Text first.** The popover opens with the text field focused, placeholder `Add a comment…`. Nothing sits above it.
- One footer row: the intent chip (`✎ Change ▾`), a palette icon for ink and stroke, `Cancel` as text and `Add ⌘↵` as the only filled button.
- Default intent: Change for shapes and text selections, Question for pins. Keys `1` to `4` switch it without opening the menu. The default is configurable in Settings.
- The focused popover border is the focus indicator. The field itself has no outline.
- A draft survives a click outside in every mode. `Esc` discards it.
- The popover is `role="dialog"`. The field gets its accessible name from a visually hidden heading (`Note 3, box`). This is the only place a field goes without a visible label.

### Threads

- A thread from an earlier round shows the reviewer's note, the agent's reply and the reviewer's pending reply in order.
- Agent status is a chip with icon and word: Applied, Partial, Declined, Deferred, Question, No reply. Never colour alone.
- A pending reply is dashed and says `Pending, sent with your decision`.

## Decision

- The split button's main action follows the state: `Approve` with no notes, `Send feedback n` with notes. The chevron opens the decision dialog.
- The dialog offers three options with one sentence each: Send feedback, Approve with notes, Approve. It shows the note count by intent, an optional summary for the agent and how many pending replies go out.
- Choosing Approve while notes exist asks once before discarding them.
- `⌘⇧↵` opens the decision from anywhere. `⌘↵` only saves a note or submits the open dialog, so a composer can never send the review by accident.

## Done page

| Outcome | Shows | Closes |
| --- | --- | --- |
| Send feedback | `Sent to <origin>`, counts, the first notes and `+ n more` | after the configured delay, with `Keep open` |
| Approve | Check, `Approved`, the target name | after the configured delay, with `Keep open` |
| Approve with notes | The notes in a dashed box, labelled as context | after the configured delay, with `Keep open` |
| Session gone | `<origin> stopped waiting`, notes not delivered, Copy as Markdown, Save annotated image, Export JSON | never on its own |

The countdown is one line with a progress bar. No duplicated close hints.

## Settings

- Sections in a left column: General, Markdown, Shortcuts, About. Changes apply immediately. The footer only holds `Reset to defaults`.
- General: Theme (Light, Dark, System as preview tiles), Close tab after a decision (Never, Now, 3 s, 5 s), Keep drafts, Tool hints, Default intent.
- Markdown: content width, font size, starting mode.
- Shortcuts: a searchable list grouped by Tools, Notes, Pages or Timeline, Review. It lists only the keys of the open mode and opens directly with `?`.

## Shortcuts

| Key | Action |
| --- | --- |
| `V` `E` `T` `R` `A` `P` `H` `C` | Select, Element, Text, Box, Arrow, Freehand, Highlighter, Pin |
| `1` to `4` | Intent of the selected note or selection |
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
- Fixed names: Change, Add, Remove, Question; Send feedback, Approve, Approve with notes; General comment; This round, Replies.
- The origin is named in full: Claude Code, OpenCode, Mistral Vibe.

## Output contract

The intent is a field of every annotation and part of the stdout output. Adding or renaming an intent changes the contract with the calling agent, so it goes with tests and an update to [usage.md](../usage.md).

## Pull request checklist

- [ ] Colours come from tokens, no literals
- [ ] Text at 12px or more, Geist Mono only for paths, selectors, timecodes and keys
- [ ] Every note carries an intent with icon and word
- [ ] Mark and card share number, colour and focus
- [ ] Every drag has a click or key alternative
- [ ] Light, dark and reduced motion checked, screenshot in the PR
- [ ] A rule that changed is updated in this file
