# Web pages

A single `http(s)` URL is captured to a screenshot and annotated like an image. Shared flags, session handling and the output format are in the [CLI reference](../usage.md).

```bash
annotaitr http://localhost:3000
annotaitr --viewport mobile --delay 1500 http://localhost:3000/checkout
```

![Web page capture with the Element tool outlining a section and its selector](../images/03-web-capture.png)

## Capture

A URL target is captured with playwright's Chromium. The `playwright`
package comes with the install, its browser build does not, and the first
capture fails with the install command until it is there:

```bash
npx playwright install chromium
```

Each playwright release expects its own Chromium revision. Outside a
project, `npx` fetches the latest playwright, so the error and the installer
script (which checks for the build) name the exact version instead, e.g.
`npx playwright@1.63.0 install chromium`. Local images,
videos, GIFs and PDFs need no browser build.

## `--viewport`

Image mode only, and only meaningful when the target is a URL. A local
image, video, GIF or PDF rejects it. A preset
(the default `desktop`, or `laptop`, `tablet`, `mobile`) or an explicit
`<width>x<height>`, each side from 200 to 4000.

```bash
annotaitr --viewport mobile http://localhost:3000/checkout
annotaitr --viewport 1024x768 http://localhost:3000
```

The viewport can also be changed after the page opened: the capture
control at the top left names it (e.g. `Desktop · 1920`) and opens a panel
that picks a preset or a custom size, a section and a delay, and captures
the page again in the same tab. The camera button next to it captures the
page again with the settings it has, for a page that changed meanwhile.
Tablet and Phone can be turned to landscape, which the feedback names as
`tablet landscape (1024×768)`; `--viewport 1024x768` captures the same
from the start.
A section captures only the visible viewport instead of the full page:
the first screen at the top, or scrolled to an anchor (`#pricing`) or a
pixel offset. Capturing again
discards the annotations made so far, after a confirmation. For a URL
target, the feedback names the capture it refers to, e.g.
`Captured at tablet (768×1024), section #pricing, after 500 ms`.

## `--delay`

Image mode only, URL targets only. Waits this many milliseconds (0 to
10000) after the page has loaded before capturing, so animations,
carousels and lazy content can settle. A local image, video, GIF, PDF or
Markdown target rejects it.

```bash
annotaitr --delay 1500 http://localhost:3000
```
