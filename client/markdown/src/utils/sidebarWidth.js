export const MIN_SIDEBAR = 300
export const MAX_SIDEBAR = 500
const MIN_MAIN = 640

/**
 * The width the changes sidebar shows. A width the reviewer dragged wins. Without
 * one it fits the longest tree row, but only as far as the main area keeps its
 * minimum next to the notes panel.
 */
export function sidebarWidth({ fitted, width, customized, viewport, reserved }) {
  if (customized) { return width }
  const room = Math.min(MAX_SIDEBAR, viewport - reserved - MIN_MAIN)
  return Math.max(width, MIN_SIDEBAR, Math.min(Math.ceil(fitted), room))
}
