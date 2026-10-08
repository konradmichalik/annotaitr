# Videos and GIFs

Supported are `.mp4`, `.m4v`, `.webm`, `.mov` and `.gif`. Shared flags, session handling and the output format are in the [CLI reference](../usage.md). Voice notes work here too, see [Voice notes](../usage.md#voice-notes).

```bash
annotaitr ./bug-recording.mov
annotaitr ./demo.gif
```

![A video on a timeline with note markers, a cluster of two close notes and two overlapping spans](../../site/images/04-video.png)

A video or GIF opens with a player docked below the canvas. Pause on a
frame and draw on it with the usual tools: each annotation is pinned to the
frame it was drawn on. For something that lasts, click **Mark span** (`I`)
at its start, move to its end and click **Set end here** (`O`). Then pick a
tool (or click **Pin** next to the span) and click the start frame, or use
**Comment span** to comment without drawing. The comment box shows what the
new annotation is pinned to, `At 00:01.000` or `Span 00:01.000 → 00:03.000`.

| Key | Action |
|-----|--------|
| `Space` | Play or pause |
| `←` / `→` | One frame back or forward |
| `Shift` + `←` / `→` | One second back or forward |
| `I` / `O` | Mark span / Set end here |
| `M` | Sound on or off |
| `Alt` + `←` / `→` on a focused marker | Move it one frame, with `Shift` its end (a moment becomes a span) |

Each annotation shows as a marker in one of two lanes above the scrubber.
**Notes** holds the moments as numbered dots in the intent's colour, **Spans**
holds the ranges as bars with the tool icon (or a speech bubble for a
text-only span) and the start of the comment; overlapping spans each get a
row of their own. A line marks the playhead across both lanes. Click a marker
to jump to it, drag it to move the annotation to another time, and drag a
span's edge to lengthen or shorten it. A moment becomes a span by dragging
the handle that appears to the right of its marker. Every change can be
undone.

Notes closer together than a marker is wide merge into a cluster chip with
their colours and their count. A click or `Enter` opens a list of them
(number, intent, timecode) above the lanes; the arrow keys move through it,
`Enter` jumps to a note and `Esc` closes the list. Marks from the earlier
round sit on the same lanes, dashed and grey, and open their thread.

Sound starts muted. The speaker button next to the speed (or `M`) turns it
on, and hovering it shows the volume slider; the setting is remembered. The
agent gets no sound, only the frames.

The browser plays the file and grabs the frames itself, so only
`@napi-rs/canvas` is needed, not playwright. Which codecs play depends on
the browser: an HEVC `.mov` does not play everywhere. The annotator then
shows the conversion command:

```bash
ffmpeg -i input.mov -c:v libx264 -pix_fmt yuv420p output.mp4
```

Agents cannot watch video, so the feedback points at still images in a temp
directory:

- one PNG per annotated moment, with the markup and a legend baked in
- a strip of six frames across every span
- `overview.png`, twelve frames spread over the whole recording with the
  annotation numbers on the nearest frame

Videos are limited to 500 MB and GIFs to 50 MB and 2000 frames. One
submission exports at most 50 distinct frames.
