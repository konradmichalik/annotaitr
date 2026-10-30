import { KeyCap } from '../../../shared/components/KeyCap.jsx'

const ALT = navigator.platform?.includes('Mac') ? '⌥' : 'Alt'

/** The status bar's help for the active mode, with its keys as key caps. */
export function ModeHelp({ pinpoint }) {
  if (pinpoint) {
    return <>Pinpoint: click a paragraph, image or diagram to comment on it. <KeyCap>V</KeyCap> back to Select text</>
  }
  return (
    <>
      Select text, then type to comment or press <KeyCap>⌫</KeyCap> to remove it. <KeyCap>{ALT}</KeyCap>+click comments at a position,
      hold <KeyCap>Shift</KeyCap> for Pinpoint
    </>
  )
}
