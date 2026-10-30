# Tools and the feedback panel

The tools float in a dock at the bottom of the work area, zoom and page
navigation at its top right, the capture control of a web page at its top
left. A mode offers only the tools that work in it. The arrow keys move along
the dock, and each tool has a letter. The letters are ignored while typing and
with a modifier held:

| Key | Image, PDF, web page, video | Markdown |
| --- | --- | --- |
| `V` | Select | Select text |
| `E` | Element (captured web pages, PDFs with text) | |
| `T` | Text (PDFs with text) | |
| `R` | Box | |
| `A` | Arrow | |
| `P` | Freehand | |
| `H` | Highlighter | |
| `C` | Pin | Pinpoint |
| `Esc` | Back to Select | |
| `G` | General comment | General comment |
| `N`, `Shift+N` | Next, previous note | Next, previous note |
| `?` | Shortcut list | Shortcut list |

The **Element** tool labels the element under the pointer with its selector
and size (`section.hero p.lede 400×22`). From the keyboard, `Tab` onto the
canvas: `Tab` and `Shift+Tab` then walk the page's elements in document
order, `↑` selects the parent (the smallest element around the current one)
and `Enter` annotates it. Past the last element `Tab` leaves the canvas.

`?` opens the full, searchable list of the open mode's keys in Settings,
under **Shortcuts**; the keyboard button in the header does the same. The
status bar names what the active tool does and its keys (unless **Tool hints**
is off). The feedback
panel lists one card per note: its number on its colour, the kind
as icon and word (Comment or Remove), the location with the kind of mark (`Page 1 · Box`), then
the quote and the comment. The number is the one the agent reads in the output
and the one on the mark.
Selecting a mark selects its card and the other way round. With two or more notes, the arrows in the panel header and `N` and `Shift+N` select the next and the previous note in number order (`2 of 5`), scroll to its mark and select its card. They stop at the first and the last note instead of wrapping, and with several markdown files they walk the notes of the open file. With an earlier
round the panel switches between **This round** and **Replies**; with several
markdown files between **This file** and **All files**. The general comment is
written in the row at the bottom of the panel (`G`). Once it has text it also
appears as a **General** card at the top of the list, with edit and delete.

## Writing a note

A new mark or text selection opens the comment box with its text field
focused. Ctrl/Cmd+Enter or **Add** saves the note, `Esc` or **Cancel**
discards it. A click outside keeps a box that holds a draft (typed text, a
or in image mode a changed ink or stroke) open, so a stray click never loses it; an
untouched box closes, and a mark that was just drawn goes with it. The footer
starts with **Remove** (`⌫`), see [notes and numbers](#notes-and-numbers). In image mode the palette
button next to it holds the ink colour, line width, line style and arrow end. In markdown mode `@` suggests files to reference and
the expand button opens a larger editor, which `Esc` collapses again.

With several markdown files the left sidebar starts with **Files**: every
file with its note count, a check once it is reviewed or `not opened` while
it was never shown, and how many of them are reviewed (`1 of 3 reviewed`).
A click or `Enter` opens a file. Below it are the contents of the open file
with the note count per section, and **Mark file as reviewed** at the bottom
records that the file is done (a second click takes it back). Opening a file
does not mark it as reviewed. A single file shows only its contents.

Selecting text in markdown mode shows a bar with **Comment** (Ctrl/Cmd+K),
**Remove** (`⌫`, or Ctrl/Cmd+D), **Label** (Alt+1 to 0) and, on a link,
**Open**. Any printable key starts a comment with that key, so selecting and
typing is enough. Alt+click comments at any position. The arrow keys move
between the bar's buttons.

## Notes and numbers

A note is a comment or a removal, nothing else. What a comment asks for, a
change, something to add or a question, is in its words, so there is nothing to
pick before typing. A removal takes out what the note points at. It is shown as
an icon and a word on the card and in the output:

| Kind | Meaning for the agent | How it is made |
| --- | --- | --- |
| Comment | Read the text and do what it asks | Typing in the composer. Shapes, pins, text selections and comments on a page or a time start as comments |
| Remove | Take out what the note points at | The composer's **Remove** button, or `⌫` before anything is typed, or `⌫` on a markdown selection |

`⌫` only counts in a field nothing was typed into: text that was typed and
then deleted never turns into a removal. A saved note keeps its kind, so to
change one, delete the note and make it again. In markdown a deletion is
always Remove, an insertion (Alt+click) a comment at a position. The general
comment has no kind.

A note gets its number when it is made and keeps it for the whole round.
Deleting a note never renumbers the others, so the output can have gaps. The
same number is on the mark, on its card, in the rendered image and in the
output, which lists the notes by position (line, page or time), not by
number. The next round starts at 1 again; earlier marks keep the round and
number they were raised with (`Round 1, mark 2`).

Notes saved before kinds and numbers existed (a JSON export, a restored
draft, a session file from an earlier round) load as they are: Change, Add and
Question read as comments, a markdown deletion as a removal, and the number
comes from the order the earlier version used.

The colour of a mark follows its number: note 1 is orange, 2 amber, 3 blue, 4
pink, then it starts over at orange. Neighbouring notes differ, and the colour
never says what a note asks for: that is the icon and the word. A shape can
carry its own ink instead, for visibility on a busy image: pick it in the
composer's palette, or fix one for new marks with the dock's colour button
(**Automatic colour** is the default). The number badge always shows the
colour of the number.

## Finishing a review

The split button at the top right is the only way out of a review. Its main
part follows the state: **Approve** while there is nothing to send, **Send
feedback** with the number of notes and pending replies otherwise. The chevron
next to it, or Ctrl/Cmd+Shift+Enter from anywhere, opens the decision dialog:

| Option | Output |
| --- | --- |
| Send feedback | The notes as change requests |
| Approve with notes | `APPROVED WITH NOTES: ...`, the notes are context |
| Approve | `APPROVED: ...`, the notes are discarded after one confirmation |

The dialog's optional summary is the general comment: it is prefilled with an
existing one and replaces it. Ctrl/Cmd+Enter submits the dialog. Outside the
dialog Ctrl/Cmd+Enter only saves the note being written, it never sends the
review.

The done page then shows what happened:

| Outcome | Shows |
| --- | --- |
| Send feedback | `Sent to <agent>`, the counts and the first notes |
| Approve | That the agent continues without changes to the target |
| Approve with notes | The notes in a dashed box, passed along as context |
| Session gone | `<agent> stopped waiting`: the session ended before the decision arrived, so nothing was delivered |

After a decision the tab closes as set in **Close tab after a decision**, with
a countdown that **Keep open** stops. The Session gone page never closes on
its own. It offers **Copy as Markdown**, **Save annotated image** (images and
PDF pages) and **Export JSON**, all made in the browser since the server is
no longer there, so the notes can go into the next session.

## Settings

The gear in the header opens the settings. Changes apply right away and are
kept in cookies on `localhost`, so they carry over between runs and modes;
**Reset to defaults** restores them.

| Section | Setting | Values |
| --- | --- | --- |
| General | Theme | Light, Dark, System |
| General | Close tab after a decision | Never (default), Now, 3 s, 5 s |
| General | Keep drafts | Markdown only: unsent notes survive a reload or a closed tab (default on), also when the agent edited the file in between: a restored note moves to where its text (or its image, link or diagram) is now, and one that cannot be found stays in the panel marked `Unanchored` and goes to the agent without a line number. Restoring from the source view switches to the preview to place the notes. A walkthrough from `annotaitr changes` keeps its draft only while it is unchanged. Image modes keep the notes on the server until the decision |
| General | Tool hints | The help line in the status bar, and in markdown mode the first-run hint for Shift+click (default on) |
| Markdown | Content width, Font size, Starting mode | Markdown mode only |
| Shortcuts | | The keys of the open mode, searchable, also opened with `?` |
| About | | Version and repository |

Settings saved by earlier versions are migrated when the annotator loads:
**Auto-save drafts** becomes **Keep drafts**, and the auto-close delay keeps
its value.
