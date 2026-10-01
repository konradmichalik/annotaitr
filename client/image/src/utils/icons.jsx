// Icons from Tabler Icons (https://tabler.io/icons), MIT licensed.
const ICON_PROPS = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
}

export const TOOL_ICONS = {
  select: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M7.904 17.563a1.2 1.2 0 0 0 2.228 .308l2.09 -3.093l4.907 4.907a1.067 1.067 0 0 0 1.509 0l1.047 -1.047a1.067 1.067 0 0 0 0 -1.509l-4.907 -4.907l3.113 -2.09a1.2 1.2 0 0 0 -.309 -2.228l-13.582 -3.904l3.904 13.563" />
    </svg>
  ),
  box: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14" />
    </svg>
  ),
  arrow: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M17 7l-10 10" />
      <path d="M8 7l9 0l0 9" />
    </svg>
  ),
  freehand: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M3 15c2 3 4 4 7 4s7 -3 7 -7s-3 -7 -6 -7s-5 1.5 -5 4s2 5 6 5s8.408 -2.453 10 -5" />
    </svg>
  ),
  highlighter: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L11 17l-4 1l1 -4L17 3z" />
      <path d="M3 21h6" />
    </svg>
  ),
  pin: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" />
    </svg>
  )
}

// Icons for the arrow end-cap style toggle in CommentPopover. Keyed by
// `arrowStyle` value, not by annotation type, so they don't belong in
// TOOL_ICONS (which AnnotationPanel looks up by annotation.type).
export const ARROW_STYLE_ICONS = {
  head: TOOL_ICONS.arrow,
  dimension: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M6 18l12 -12" />
      <path d="M3 15l6 6" />
      <path d="M15 3l6 6" />
    </svg>
  ),
  none: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M7 17l10 -10" />
    </svg>
  ),
  double: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M7 17l10 -10" />
      <path d="M8 7l9 0l0 9" />
      <path d="M16 17l-9 0l0 -9" />
    </svg>
  )
}

export const ACTION_ICONS = {
  remove: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1 -1.995 -1.858L5 7m5 4v6m4 -6v6m1 -10V4a1 1 0 0 0 -1 -1h-4a1 1 0 0 0 -1 1v3M4 7h16" />
    </svg>
  ),
  edit: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  close: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M18 6l-12 12" /><path d="M6 6l12 12" />
    </svg>
  ),
  addComment: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  // Tabler "message": a text-only comment, as opposed to a drawn mark.
  comment: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M8 9h8" /><path d="M8 13h6" />
      <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z" />
    </svg>
  )
}

export const ZOOM_ICONS = {
  in: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M7 10l6 0" />
      <path d="M10 7l0 6" />
      <path d="M21 21l-6 -6" />
    </svg>
  ),
  out: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M7 10l6 0" />
      <path d="M21 21l-6 -6" />
    </svg>
  ),
  reset: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M21 21l-6 -6" />
      <path d="M3.268 12.043a7.017 7.017 0 0 0 6.634 4.957a7.012 7.012 0 0 0 7.043 -6.131a7 7 0 0 0 -5.314 -7.672a7.021 7.021 0 0 0 -8.241 4.403" />
      <path d="M3 4v4h4" />
    </svg>
  ),
  fit: (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
      <path d="M4 16v2a2 2 0 0 0 2 2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
    </svg>
  )
}

// Player and span controls, drawn for this project in the same 24px grid.
const FILLED_PROPS = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true }
const SPEAKER = <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" />

export const PLAYER_ICONS = {
  play: (
    <svg {...FILLED_PROPS}>
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
    </svg>
  ),
  pause: (
    <svg {...FILLED_PROPS}>
      <rect x="6" y="4" width="4" height="16" rx="1.5" />
      <rect x="14" y="4" width="4" height="16" rx="1.5" />
    </svg>
  ),
  previousFrame: (
    <svg {...ICON_PROPS} strokeWidth="2.25" aria-hidden="true">
      <line x1="6" y1="5" x2="6" y2="19" /><polyline points="18 6 11 12 18 18" />
    </svg>
  ),
  nextFrame: (
    <svg {...ICON_PROPS} strokeWidth="2.25" aria-hidden="true">
      <line x1="18" y1="5" x2="18" y2="19" /><polyline points="6 6 13 12 6 18" />
    </svg>
  ),
  sound: (
    <svg {...ICON_PROPS} aria-hidden="true">
      {SPEAKER}<path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  ),
  muted: (
    <svg {...ICON_PROPS} aria-hidden="true">
      {SPEAKER}<line x1="16" y1="9.5" x2="21" y2="14.5" /><line x1="21" y1="9.5" x2="16" y2="14.5" />
    </svg>
  ),
  span: (
    <svg {...ICON_PROPS} strokeWidth="2.25" aria-hidden="true">
      <line x1="4" y1="5" x2="4" y2="19" /><line x1="20" y1="5" x2="20" y2="19" />
      <line x1="8" y1="12" x2="16" y2="12" /><polyline points="11 9 8 12 11 15" /><polyline points="13 9 16 12 13 15" />
    </svg>
  )
}
