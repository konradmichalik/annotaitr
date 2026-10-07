import { formatTimecode } from '../video/timeline.js'

// The CLI labels an image read from the clipboard this way (cli/image.js).
const CLIPBOARD_LABEL = 'clipboard image'

/** Which source chip the header shows, derived from `/api/meta`. */
export function sourceKind(meta) {
  if (!meta) { return null }
  if (meta.kind === 'document') { return 'pdf' }
  if (meta.kind === 'video') { return 'video' }
  if (meta.capture) { return 'url' }
  return meta.targetLabel === CLIPBOARD_LABEL ? 'clipboard' : 'image'
}

/** The one line of facts after the target: pages of a PDF, duration and size of a recording, size of an image. */
export function targetFacts({ kind, pageCount, width, height, duration }) {
  if (kind === 'pdf') { return `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}` }
  const size = width && height ? `${width} × ${height}` : null
  const length = kind === 'video' && Number.isFinite(duration) ? formatTimecode(duration) : null
  return [length, size].filter(Boolean).join(' · ')
}
