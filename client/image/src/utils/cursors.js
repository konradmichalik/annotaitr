// A small marker-pen glyph (reusing the highlighter tool icon's silhouette)
// used as a custom cursor while the highlighter tool is active, so it reads
// as "this pen leaves a mark" rather than the generic crosshair every other
// drawing tool uses. Fixed size regardless of the configured stripe width:
// browsers cap cursor bitmaps around 32px, so a width-reactive cursor would
// silently stop tracking (and misrepresent) anything past the midpoint of
// the width range - the stroke itself already gives exact width feedback
// the instant a drag starts.
const HIGHLIGHTER_CURSOR_SVG = encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>"
  + "<path d='M17 3a2.85 2.83 0 1 1 4 4L11 17l-4 1l1 -4L17 3z' fill='#ffd43b' stroke='#000' stroke-width='1.5' stroke-linejoin='round' stroke-linecap='round'/>"
  + '</svg>'
)

// Hotspot (11, 17) is the pen tip in the 24x24 glyph above, i.e. where a mark
// actually starts. `crosshair` is the fallback if the data-URI cursor fails
// to load, matching every other drawing tool's default.
const HIGHLIGHTER_CURSOR = `url("data:image/svg+xml,${HIGHLIGHTER_CURSOR_SVG}") 11 17, crosshair`

/** The base (non-hover, non-dragging) cursor for the currently active tool. */
export function cursorForTool(tool) {
  if (tool === 'select') { return 'grab' }
  // Picking a page element is a click on something, not drawing.
  if (tool === 'element') { return 'pointer' }
  if (tool === 'highlighter') { return HIGHLIGHTER_CURSOR }
  return 'crosshair'
}
